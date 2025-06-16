import React, { useState, useEffect, useRef } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CheckCircle, AlertCircle, Clock, Search, ChevronLeft, ChevronRight, FileSpreadsheet, Loader } from 'lucide-react';
import Pagination from '@mui/material/Pagination';
import pLimit from 'p-limit';


// Import the NetworkFunctionStatusTable component
import NetworkFunctionStatusTable from './NetworkFunctionStatusTable';

// Import API service functions
import {
  fetchNetworkFunctionInfo,
  fetchQuestionnaireData
} from '../../components/api-service';

// Status colors
const STATUS_COLORS = {
  low: '#FF6B6B',
  medium: '#FFD166',
  high: '#06D6A0'
};

// Calculate automation percentage
const calculateAutomationPercentage = (manualSteps, automatedSteps) => {
  if (manualSteps + automatedSteps === 0) return 0;
  return Math.round((automatedSteps / (manualSteps + automatedSteps)) * 100);
};

function NaaviDashboard() {
  // State variables
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef(null);
  const [expandedFunction, setExpandedFunction] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [selectedFunction, setSelectedFunction] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [selectedNF, setSelectedNF] = useState('all');
  const [expandedPanel, setExpandedPanel] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [searchTerm, setSearchTerm] = useState('');
  const [allExpanded, setAllExpanded] = useState(false);

  // Data states
  const [networkFunctions, setNetworkFunctions] = useState([]);
  const [versions, setVersions] = useState({});
  // eslint-disable-next-line no-unused-vars
  const [sectionData, setSectionData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [questionnairesData, setQuestionnairesData] = useState([]);

  // Application status states
  const [applicationData, setApplicationData] = useState([]);
  const [applicationTotals, setApplicationTotals] = useState({
    NFs: 0,
    notStarted: 0,
    inProgress: 0,
    completed: 0
  });

  // Helper functions
  const getStatusColor = (percentage) => {
    if (percentage < 30) return STATUS_COLORS.low;
    if (percentage < 70) return STATUS_COLORS.medium;
    return STATUS_COLORS.high;
  };

  const getStatusIcon = (percentage) => {
    if (percentage < 30) return <AlertCircle className="text-red-500" size={20} />;
    if (percentage < 70) return <Clock className="text-yellow-500" size={20} />;
    return <CheckCircle className="text-green-500" size={20} />;
  };

  // Helper function to extract application ID
  const extractApplicationId = (nf) => {
    // Use vendor field if available
    if (nf.vendor && nf.vendor.trim() !== '') {
      return nf.vendor;
    }

    // Fallback to splitting NF name only if vendor field is not available
    // if (nf.nf_name) {
    //   const parts = nf.nf_name.split(' ');
    //   return parts.length > 0 ? parts[0] : '';
    // }

    return '';
  };

  // Calculate application status data from network functions and questionnaires
  const calculateApplicationStatusData = (networkFunctions, questionnairesData) => {
    // Group network functions by application ID
    const applicationGroups = {};

    networkFunctions.forEach(nf => {
      const appId = extractApplicationId(nf);

      if (!applicationGroups[appId]) {
        applicationGroups[appId] = {
          id: appId,
          nfs: []
        };
      }

      applicationGroups[appId].nfs.push(nf);
    });

    // Calculate status for each application group
    const applications = Object.values(applicationGroups).map(app => {
      // Count NFs that start with the application name (categorized)
      const nfCount = app.nfs.length;

      // Count NFs that have questionnaire data (in-progress)
      let inProgressCount = 0;

      // For each NF in this application group
      app.nfs.forEach(nf => {
        // Check if there's any questionnaire data for this NF
        const hasQuestionnaireData = questionnairesData.some(q =>
          (q.nfName === nf.nf_name || q.nf_name === nf.nf_name) &&
          q.sections &&
          q.sections.length > 0
        );

        // If this NF has questionnaire data, count it as in-progress
        if (hasQuestionnaireData) {
          inProgressCount++;
        }
      });

      // Not started = categorized - in-progress
      const notStartedCount = nfCount - inProgressCount;

      // For now, count completed as 0 since we're basing status only on existence of records
      const completedCount = 0;

      return {
        id: app.id,
        NFs: nfCount,
        notStarted: notStartedCount,
        inProgress: inProgressCount,
        completed: completedCount
      };
    });

    // Calculate totals
    const totals = {
      NFs: applications.reduce((sum, app) => sum + app.NFs, 0),
      notStarted: applications.reduce((sum, app) => sum + app.notStarted, 0),
      inProgress: applications.reduce((sum, app) => sum + app.inProgress, 0),
      completed: applications.reduce((sum, app) => sum + app.completed, 0)
    };

    return {
      applications,
      totals
    };
  };

  // Calculate completion percentages for sections
  const calculateSectionCompletion = (sections) => {
    if (!sections || !Array.isArray(sections)) {
      return [];
    }

    return sections.map(section => {
      const totalQuestions = section.questions ? section.questions.length : 0;
      if (totalQuestions === 0) return { ...section, completionPercentage: 0 };

      // Count answered questions (non-empty answers)
      const answeredQuestions = section.questions ? section.questions.filter(q =>
        q.answer &&
        (typeof q.answer === 'string' ? q.answer.trim() !== '' : true)
      ).length : 0;

      const completionPercentage = Math.round((answeredQuestions / totalQuestions) * 100);

      return {
        ...section,
        name: section.sectionName || section.section_name,
        completionPercentage
      };
    });
  };

  // Calculate automation metrics from questionnaire data across all sections
  const calculateAutomationFromQuestionnaire = (questionnaire) => {
    if (!questionnaire || !questionnaire.sections || !Array.isArray(questionnaire.sections)) {
      return { totalSteps: 0, automatedSteps: 0, automationPercentage: 0 };
    }

    let totalSteps = 0;
    let automatedSteps = 0;

    // Map of section names to their corresponding "total steps" question ID
    const totalStepsQuestionIdMap = {
      'healthcheck': 'stepsCount',
      'preinstall': 'stepsCount',
      'install': 'installSteps',
      'postinstall': 'postInstallSteps',
      'preupgrade': 'stepsCount',
      'upgrade': 'stepsCount',
      'postupgrade': 'stepsCount',
      'configaudit': 'stepsCount',
      'configchange': 'stepsCount',
      'rollback': 'stepsCount',
      'georedundant': 'stepsCount',
      'disasterrecovery': 'stepsCount'
    };

    // Look through all sections to find the relevant questions
    questionnaire.sections.forEach(section => {
      if (!section.questions || !Array.isArray(section.questions)) return;

      // Get the correct question ID for total steps based on section name
      const sectionName = section.sectionName || section.section_name;
      const totalStepsQuestionId = totalStepsQuestionIdMap[sectionName] || 'stepsCount';

      // Extract steps count and automated steps count from this section
      let sectionTotalSteps = 0;
      let sectionAutomatedSteps = 0;

      section.questions.forEach(question => {
        // Look for total steps question using the correct ID for this section
        if (question.questionId === totalStepsQuestionId && question.answer) {
          const parsedSteps = parseInt(question.answer, 10);
          if (!isNaN(parsedSteps)) {
            sectionTotalSteps = parsedSteps;
          }
        }

        // Look for automated steps question (consistently named across sections)
        if (question.questionId === 'automatedStepsCount' && question.answer) {
          const parsedAutomated = parseInt(question.answer, 10);
          if (!isNaN(parsedAutomated)) {
            sectionAutomatedSteps = parsedAutomated;
          }
        }
      });

      // Add section numbers to totals
      totalSteps += sectionTotalSteps;
      automatedSteps += sectionAutomatedSteps;
    });

    // Calculate automation percentage
    const automationPercentage = totalSteps === 0 ? 0 : Math.round((automatedSteps / totalSteps) * 100);

    return {
      totalSteps,
      automatedSteps,
      manualSteps: totalSteps - automatedSteps,
      automationPercentage
    };
  };

  // Generate versions data from network functions
  const generateVersionsData = (rawNfData, questionnairesData) => {
    const versionsData = {};

    rawNfData.forEach((nf, index) => {
      const nfId = index + 1;

      if (nf.versions && Array.isArray(nf.versions)) {
        versionsData[nfId] = nf.versions.map((versionObj, vIdx) => {
          const versionName = versionObj.name;

          // Find questionnaire data for this version
          const versionQuestionnaire = questionnairesData.find(q =>
            (q.nfName === nf.nf_name || q.nf_name === nf.nf_name) &&
            ((typeof q.version === 'object' ? q.version.name : q.version) === versionName)
          );

          // Calculate completion percentage
          let completionPercentage = 0;
          let automationData = { totalSteps: 0, automatedSteps: 0, manualSteps: 0, automationPercentage: 0 };

          if (versionQuestionnaire) {
            // Calculate completion
            if (versionQuestionnaire.sections) {
              const sections = calculateSectionCompletion(versionQuestionnaire.sections);
              completionPercentage = sections.reduce((acc, section) => acc + section.completionPercentage, 0) /
                Math.max(1, sections.length);
            }

            // Calculate automation
            automationData = calculateAutomationFromQuestionnaire(versionQuestionnaire);
          }

          // Use the real data from questionnaires
          const manualSteps = automationData.manualSteps;
          const automatedSteps = automationData.automatedSteps;
          const automationPercentage = calculateAutomationPercentage(manualSteps, automatedSteps);

          return {
            id: (nfId * 100) + vIdx + 1,
            name: versionName,
            status: versionObj.status,
            latest: versionObj.latest,
            completionPercentage: Math.round(completionPercentage),
            manualSteps,
            automatedSteps,
            automationPercentage
          };
        });
      }
    });

    return versionsData;
  };

  // Transform network functions data with actual automation metrics from questionnaires
  const transformNetworkFunctionData = (nfData, questionnairesData) => {
    if (!nfData || !Array.isArray(nfData)) {
      return [];
    }

    return nfData.map((nf, index) => {
      // Find all questionnaires for this NF
      const nfQuestionnaires = questionnairesData.filter(q =>
        q.nfName === nf.nf_name || q.nf_name === nf.nf_name
      );

      // Get versions count
      const versionsCount = nf.versions ? nf.versions.length : 0;

      // Calculate completion percentage across all versions
      let completionPercentage = 0;
      let totalSteps = 0;
      let automatedSteps = 0;

      if (nfQuestionnaires.length > 0) {
        // Process all questionnaires for this NF
        let totalCompletion = 0;

        nfQuestionnaires.forEach(q => {
          // Calculate completion
          if (q.sections && Array.isArray(q.sections)) {
            const sectionsWithCompletion = calculateSectionCompletion(q.sections);
            const qCompletion = sectionsWithCompletion.reduce((acc, section) =>
              acc + section.completionPercentage, 0) / Math.max(1, sectionsWithCompletion.length);
            totalCompletion += qCompletion;

            // Calculate automation
            const automationData = calculateAutomationFromQuestionnaire(q);
            totalSteps += automationData.totalSteps;
            automatedSteps += automationData.automatedSteps;
          }
        });

        completionPercentage = Math.round(totalCompletion / nfQuestionnaires.length);
      }

      // Calculate manual steps (total steps - automated steps)
      const manualSteps = totalSteps > 0 ? (totalSteps - automatedSteps) : 0;
      const automationPercentage = calculateAutomationPercentage(manualSteps, automatedSteps);

      // Include the vendor field from the collection
      return {
        id: index + 1,
        name: nf.nf_name || nf.name,
        // Use the vendor field directly instead of extracting it
        vendor: nf.vendor || "",
        versionsCount,
        completionPercentage,
        manualSteps,
        automatedSteps,
        automationPercentage
      };
    });
  };


  // Fetch data from the backend when the component mounts
  useEffect(() => {
      const fetchData = async () => {
        setLoading(true);
        setError(null);
  
        try {
          console.log('Fetching network function information...');
          const nfData = await fetchNetworkFunctionInfo();
          if (!nfData || !Array.isArray(nfData) || nfData.length === 0) {
            throw new Error('No network function data available');
          }
  
          console.log('Fetching questionnaire data for all network functions...');
        const limit = pLimit(5);
         const allQuestionnaires = await Promise.all(
          nfData.flatMap(nf =>
            nf.versions?.map(versionObj =>
              limit(() => fetchQuestionnaireData(nf.nf_name, versionObj.name).catch(error => {
                console.warn(`Error fetching questionnaire data for ${nf.nf_name} ${versionObj.name}:`, error);
                return null; // Return null for failed requests
              }))
            ) || []
          )
        );
  
          // Filter out null values from failed requests
          const validQuestionnaires = allQuestionnaires.filter(q => q !== null);
  
          console.log('Transforming network function data...');
          const transformedNfData = transformNetworkFunctionData(nfData, validQuestionnaires);
  
          console.log('Generating versions data...');
          const versionsData = generateVersionsData(nfData, validQuestionnaires);
          console.log('Generated versions data:', versionsData);
  
          console.log('Generating section data...');
          let aggregatedSections = [];
          if (validQuestionnaires.length > 0) {
            const allSections = validQuestionnaires.flatMap(q => q.sections || []);
            console.log('Total sections extracted:', allSections.length);
  
            if (allSections.length > 0) {
              aggregatedSections = calculateSectionCompletion(allSections);
              const sectionNameMap = aggregatedSections.reduce((acc, section) => {
                if (!section.name) return acc;
                if (!acc[section.name]) {
                  acc[section.name] = {
                    name: section.name,
                    totalPercentage: section.completionPercentage,
                    count: 1
                  };
                } else {
                  acc[section.name].totalPercentage += section.completionPercentage;
                  acc[section.name].count += 1;
                }
                return acc;
              }, {});
  
              const finalSections = Object.values(sectionNameMap).map(section => ({
                name: section.name,
                completionPercentage: Math.round(section.totalPercentage / section.count)
              }));
  
              console.log('Final aggregated sections:', finalSections);
              setSectionData(finalSections);
            }
          }
  
          console.log('Calculating application status data...');
          const { applications, totals } = calculateApplicationStatusData(nfData, validQuestionnaires);
          console.log('Application status data:', applications);
          console.log('Application totals:', totals);
  
          setQuestionnairesData(validQuestionnaires);
          setNetworkFunctions(transformedNfData);
          setVersions(versionsData);
          setApplicationData(applications);
          setApplicationTotals(totals);
        } catch (error) {
          console.error('Error fetching data:', error);
          setError(`Failed to fetch data: ${error.message}`);
        } finally {
          setLoading(false);
        }
      };
  
      fetchData();
    }, []);
  
   
  // Measure header height on mount
  useEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight);
    }
  }, []);

  // Extract vendors using the vendor field directly from the collection
  const vendors = ['all', ...Array.from(new Set(networkFunctions
    .map(func => func.vendor)
    .filter(vendor => vendor && vendor.trim() !== '') // Filter out empty vendor fields
  ))];

  // For NFs, get complete function names filtered by vendor
  const getNFOptions = () => {
    if (selectedVendor === 'all') {
      // Return all unique function names when 'all' is selected
      return ['all', ...Array.from(new Set(networkFunctions.map(func => func.name)))];
    } else {
      // Return function names for the selected vendor
      const filteredByVendor = networkFunctions.filter(func =>
        func.vendor === selectedVendor
      );
      return ['all', ...Array.from(new Set(filteredByVendor.map(func => func.name)))];
    }
  };

  // Filter by vendor field instead of name prefix
  const getFilteredByVendor = () => {
    let filtered = networkFunctions;
    if (selectedVendor !== 'all') {
      filtered = filtered.filter(func => func.vendor === selectedVendor);
    }
    return filtered;
  };

  // Filter by NF - no change needed
  const getFilteredByNF = (functions) => {
    if (selectedNF === 'all') return functions;
    return functions.filter(func => func.name === selectedNF);
  };

  // Combined vendor and NF filtering - no change needed
  const getFilteredByVendorAndNF = () => {
    let filtered = getFilteredByVendor();
    filtered = getFilteredByNF(filtered);
    return filtered;
  };

  // Combined filtering (vendor + NF + search) - no change needed
  const getFilteredFunctions = () => {
    let filtered = getFilteredByVendorAndNF();
    if (searchTerm) {
      filtered = filtered.filter(func =>
        func.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return filtered;
  };

  // Pagination
  const filteredFunctions = getFilteredFunctions();
  const totalPages = Math.ceil(filteredFunctions.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentFunctions = filteredFunctions.slice(indexOfFirstItem, indexOfLastItem);

  useEffect(() => {
    // Reset to "all" when vendor changes
    setSelectedNF('all');
  }, [selectedVendor]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedVendor, selectedNF, searchTerm]);

  // Calculate overall completion percentage
  const calculateOverallCompletion = () => {
    if (selectedVersion && selectedFunction) {
      // Show completion for selected version
      const version = versions[selectedFunction]?.find(v => v.id === selectedVersion);
      return version?.completionPercentage || 0;
    } else if (selectedFunction) {
      // Show completion for selected function
      const func = networkFunctions.find(f => f.id === selectedFunction);
      return func?.completionPercentage || 0;
    } else {
      // Show average completion for filtered functions
      const filtered = getFilteredByVendorAndNF();
      if (filtered.length === 0) return 0;

      const totalCompletion = filtered.reduce((acc, curr) => acc + curr.completionPercentage, 0);
      return Math.round(totalCompletion / filtered.length);
    }
  };

  // Export to CSV function
  const exportToCSV = () => {
    // Create CSV data for summary
    let csvContent = "Network Function Progress Dashboard\n\n";
    csvContent += "Summary\n";
    csvContent += `Export Date,${new Date().toLocaleDateString()}\n`;
    csvContent += `Total Functions,${networkFunctions.length}\n`;
    csvContent += `Total Versions,${Object.values(versions).reduce((acc, curr) => acc + (curr?.length || 0), 0)}\n`;

    const avgCompletion = networkFunctions.length > 0
      ? Math.round(networkFunctions.reduce((acc, curr) => acc + curr.completionPercentage, 0) / networkFunctions.length)
      : 0;

    const avgAutomation = networkFunctions.length > 0
      ? Math.round(networkFunctions.reduce((acc, curr) => acc + curr.automationPercentage, 0) / networkFunctions.length)
      : 0;

    csvContent += `Average Completion,${avgCompletion}%\n`;
    csvContent += `Average Automation,${avgAutomation}%\n`;
    csvContent += `Completed Functions,${networkFunctions.filter(func => func.completionPercentage >= 90).length}\n\n`;

    // Add filters
    csvContent += "Active Filters\n";
    csvContent += `Selected Vendor,${selectedVendor}\n`;
    csvContent += `Selected NF,${selectedNF}\n`;
    csvContent += `Search Term,${searchTerm || "None"}\n\n`;

    // Add overall progress
    const overallCompletion = calculateOverallCompletion();

    csvContent += "Overall Progress\n";
    csvContent += `Completed,${overallCompletion}%\n`;
    csvContent += `Remaining,${100 - overallCompletion}%\n\n`;

    // Add function completion data
    csvContent += "Function Completion\n";
    csvContent += "Function Name,Vendor,Completion %\n";
    getFilteredByVendorAndNF().forEach(f => {
      csvContent += `${f.name},${f.vendor},${f.completionPercentage}%\n`;
    });
    csvContent += "\n";

    // Add section progress
    csvContent += "Section Progress\n";
    csvContent += "Section,Completion %\n";
    getSectionProgressByVendor().forEach(section => {
      csvContent += `${section.name},${section.completionPercentage}%\n`;
    });
    csvContent += "\n";

    // Add detailed functions data
    csvContent += "Network Functions Details\n";
    csvContent += "Function Name,Vendor,Overall Completion %,Automation %,Manual Steps,Automated Steps,Versions,Version Details\n";
    filteredFunctions.forEach(func => {
      csvContent += `${func.name},${func.vendor},${func.completionPercentage}%,${func.automationPercentage}%,${func.manualSteps},${func.automatedSteps},${versions[func.id]?.length || 0},\n`;

      const versionList = versions[func.id] || [];
      versionList.forEach(version => {
        csvContent += `,,,,,,${version.name},"Completion: ${version.completionPercentage}%, Manual: ${version.manualSteps}, Auto: ${version.automatedSteps}, Auto Rate: ${version.automationPercentage}%"\n`;
      });
      csvContent += "\n";
    });

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Network_Functions_Progress_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate section progress based on vendor and NF filters
  const getSectionProgressByVendor = () => {
    // If no questionnaire data, return empty array
    if (!questionnairesData || questionnairesData.length === 0) {
      return [];
    }

    // Determine which questionnaires to include based on filters
    let filteredQuestionnaires = [...questionnairesData];

    // Get the list of NF names that match our vendor filter
    const filteredNfNames = [];
    if (selectedVendor !== 'all') {
      // Get all NF names with the selected vendor
      networkFunctions.forEach(nf => {
        if (nf.vendor === selectedVendor) {
          filteredNfNames.push(nf.name);
        }
      });

      // Filter questionnaires by those NF names
      filteredQuestionnaires = filteredQuestionnaires.filter(q => {
        const nfName = q.nfName || q.nf_name || '';
        return filteredNfNames.includes(nfName);
      });
    }

    // Filter by NF
    if (selectedNF !== 'all') {
      filteredQuestionnaires = filteredQuestionnaires.filter(q => {
        const nfName = q.nfName || q.nf_name || '';
        return nfName === selectedNF;
      });
    }

    // If a specific function is selected
    if (selectedFunction) {
      const funcName = networkFunctions.find(f => f.id === selectedFunction)?.name;
      if (funcName) {
        filteredQuestionnaires = filteredQuestionnaires.filter(q =>
          (q.nfName === funcName || q.nf_name === funcName) &&
          (!selectedVersion || q.version === versions[selectedFunction]?.find(v => v.id === selectedVersion)?.name)
        );
      }
    }

    // Extract all sections
    const allSections = [];
    filteredQuestionnaires.forEach(q => {
      if (q.sections && Array.isArray(q.sections)) {
        allSections.push(...q.sections);
      }
    });

    // If no sections found after filtering
    if (allSections.length === 0) {
      return [];
    }

    // Calculate completion for each section
    const sectionsWithCompletion = calculateSectionCompletion(allSections);

    // Aggregate by section name
    const sectionNameMap = {};
    sectionsWithCompletion.forEach(section => {
      if (!section.name) return;

      if (!sectionNameMap[section.name]) {
        sectionNameMap[section.name] = {
          name: section.name,
          totalPercentage: section.completionPercentage,
          count: 1
        };
      } else {
        sectionNameMap[section.name].totalPercentage += section.completionPercentage;
        sectionNameMap[section.name].count += 1;
      }
    });

    // Calculate averages and return the results
    return Object.values(sectionNameMap).map(section => ({
      name: section.name,
      completionPercentage: Math.round(section.totalPercentage / section.count)
    }));
  };

  // Toggle function expansion
  const toggleFunction = (functionId) => {
    if (expandedFunction === functionId) {
      setExpandedFunction(null);
      setSelectedVersion(null);
      setSelectedFunction(null);
    } else {
      setExpandedFunction(functionId);
      setSelectedFunction(functionId);
      setSelectedVersion(null);
    }
  };

  // Toggle all functions expansion
  const toggleAllFunctions = () => {
    if (allExpanded) {
      setExpandedFunction(null);
      setSelectedVersion(null);
      setSelectedFunction(null);
    } else {
      // Don't set expanded function to avoid conflicts with individual toggles
      setSelectedVersion(null);
      setSelectedFunction(null);
    }
    setAllExpanded(!allExpanded);
  };

  // Select version
  const selectVersion = (versionId) => {
    setSelectedVersion(versionId);
  };

  // Calculate overall progress percentage
  const overallProgress = applicationTotals.NFs > 0
    ? Math.round((applicationTotals.inProgress / applicationTotals.NFs) * 100)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <Loader className="mx-auto h-12 w-12 text-blue-600 animate-spin" />
          <p className="mt-4 text-lg text-gray-700">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center max-w-lg">
          <AlertCircle className="mx-auto h-12 w-12 text-red-600" />
          <h2 className="mt-4 text-xl font-bold text-gray-900">Error Loading Data</h2>
          <p className="mt-2 text-base text-gray-700">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // If no data is available, show empty state
  if (networkFunctions.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center max-w-lg">
          <AlertCircle className="mx-auto h-12 w-12 text-yellow-600" />
          <h2 className="mt-4 text-xl font-bold text-gray-900">No Data Available</h2>
          <p className="mt-2 text-base text-gray-700">
            No network functions or questionnaires found. Please add network functions and complete questionnaires.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // Calculate completion for the donut chart
  const overallCompletion = calculateOverallCompletion();

  return (
    <div className="bg-gray-50 min-h-screen font-sans">
      {/* Fixed Header */}
      <div
        ref={headerRef}
        className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-white shadow-lg"
      >
        <div className="max-w-screen-2xl mx-auto">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">NAAVI Dashboard</h1>
          </div>
        </div>
      </div>

      {/* Spacer to prevent content from being hidden under fixed header */}
      <div className="h-24"></div>

      <div className="p-6 pt-0">
        {/* Summary Cards - Using data from application status */}
        <div className="flex flex-row gap-4 mb-6 overflow-x-auto pb-2">
          <div className="bg-white rounded-xl shadow-lg p-4 min-w-36 flex-1">
            <h2 className="text-lg font-semibold text-gray-700 mb-1">Total Functions</h2>
            <p className="text-3xl font-bold text-blue-600">{applicationTotals.NFs}</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 min-w-36 flex-1">
            <h2 className="text-lg font-semibold text-gray-700 mb-1">Not Started</h2>
            <p className="text-3xl font-bold text-red-600">{applicationTotals.notStarted}</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 min-w-36 flex-1">
            <h2 className="text-lg font-semibold text-gray-700 mb-1">In-Progress</h2>
            <p className="text-3xl font-bold text-yellow-600">{applicationTotals.inProgress}</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 min-w-36 flex-1">
            <h2 className="text-lg font-semibold text-gray-700 mb-1">Overall Progress</h2>
            <p className="text-3xl font-bold text-green-600">{overallProgress}%</p>
          </div>
        </div>

        {/* Network Function Status Table - Now using the pre-calculated data */}
        <NetworkFunctionStatusTable
          applicationData={applicationData}
          totals={applicationTotals}
          loading={loading}
          error={error}
          networkFunctions={networkFunctions}
        />

        {/* Overall Progress and Section Progress in a horizontal row */}
        <div className="flex flex-row gap-6 overflow-x-auto pb-2 mb-6 relative">
          {/* Overall Progress */}
          <div className="bg-white rounded-xl shadow-lg p-6 min-w-80 flex-1">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">
                {selectedFunction
                  ? `${networkFunctions.find(f => f.id === selectedFunction)?.name || ''} ${selectedVersion
                    ? `(${versions[selectedFunction]?.find(v => v.id === selectedVersion)?.name || ''})`
                    : ''}`
                  : 'Overall Progress'}
              </h2>

              {/* Filter section */}
              <div className="flex items-center gap-3">
                <div className="flex flex-1 items-center gap-1 max-w-[33%]">
                  <label htmlFor="vendor-filter" className="text-sm text-gray-600">Vendor:</label>
                  <select
                    id="vendor-filter"
                    value={selectedVendor}
                    onChange={(e) => setSelectedVendor(e.target.value)}
                    className="flex-1 min-w-0 truncate bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-1"
                  >
                    {vendors.map(vendor => (
                      <option key={vendor} value={vendor}>{vendor === 'all' ? 'All Vendors' : vendor}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1 flex-1 max-w-[33%]">
                  <label htmlFor="nf-filter" className="text-sm text-gray-600 whitespace-nowrap">NF:</label>
                  <select
                    id="nf-filter"
                    value={selectedNF}
                    onChange={(e) => setSelectedNF(e.target.value)}
                    className="min-w-0 flex-1 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-1 w-full max-w-[350px] text-ellipsis"
                    style={{
                      textOverflow: 'ellipsis',
                      overflow: 'hidden'
                    }}
                  >
                    {getNFOptions().map(nf => (
                      <option key={nf} value={nf} title={nf}>{nf === 'all' ? 'All NFs' : nf}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => setExpandedPanel('overall')}
                  className="bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-lg border border-blue-300 hover:bg-blue-100 transition-colors"
                >
                  Expand
                </button>
              </div>
            </div>

            {/* Progress Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pie Chart */}
              <div className="h-64 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Completed', value: overallCompletion },
                        { name: 'Remaining', value: 100 - overallCompletion }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill="#06D6A0" />
                      <Cell fill="#EEEEEE" />
                    </Pie>
                    <Tooltip />
                    <text
                      x="50%"
                      y="50%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-xl font-bold"
                      fill="#333333"
                    >
                      {overallCompletion}%
                    </text>
                  </PieChart>
                </ResponsiveContainer>
                <div className="text-center mt-2">
                  <p className="text-gray-600 text-sm">Overall Completion</p>
                </div>
              </div>

              {/* Bar Chart */}
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={getFilteredByVendorAndNF().map(f => ({
                      name: f.name,
                      completion: f.completionPercentage
                    }))}
                    margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-45}  // Rotate labels
                      textAnchor="end"  // Align the end of text with the tick
                      height={70}  // Increase height for rotated labels
                      tick={{ fontSize: 10 }}  // Reduce font size
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(value) => [`${value}%`, 'Completion']} />
                    <Bar dataKey="completion" name="Completion %" fill="#8884d8">
                      {getFilteredByVendorAndNF().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getStatusColor(entry.completionPercentage)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Section Progress */}
          <div className="bg-white rounded-xl shadow-lg p-6 min-w-80 flex-1">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Section Progress</h2>
              <div className="flex items-center gap-3">
                <div className="flex flex-1 items-center gap-1 max-w-[33%]">
                  <label htmlFor="section-vendor-filter" className="text-sm text-gray-600">Vendor:</label>
                  <select
                    id="section-vendor-filter"
                    value={selectedVendor}
                    onChange={(e) => setSelectedVendor(e.target.value)}
                    className="flex-1 min-w-0 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-1 truncate"
                  >
                    {vendors.map(vendor => (
                      <option key={vendor} value={vendor}>{vendor === 'all' ? 'All Vendors' : vendor}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1 flex-1 max-w-[33%]">
                  <label htmlFor="section-nf-filter" className="text-sm text-gray-600 whitespace-nowrap">NF:</label>
                  <select
                    id="section-nf-filter"
                    value={selectedNF}
                    onChange={(e) => setSelectedNF(e.target.value)}
                    className="flex-1 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-1 w-full max-w-[350px] text-ellipsis"
                    style={{
                      textOverflow: 'ellipsis',
                      overflow: 'hidden'
                    }}
                  >
                    {getNFOptions().map(nf => (
                      <option key={nf} value={nf} title={nf}>{nf === 'all' ? 'All NFs' : nf}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setExpandedPanel('section')}
                  className="bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-lg border border-blue-300 hover:bg-blue-100 transition-colors"
                >
                  Expand
                </button>
              </div>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {(selectedVendor !== 'all' || selectedNF !== 'all') && getFilteredByVendorAndNF().length === 0 && (
                <div className="text-center text-gray-500 py-4">
                  No functions found for selected filters
                </div>
              )}
              {getSectionProgressByVendor().length === 0 ? (
                <div className="text-center text-gray-500 py-4">
                  No section data available
                </div>
              ) : (
                getSectionProgressByVendor().map((section, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-800">{section.name}</span>
                      <span
                        className="text-sm font-medium px-2.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${getStatusColor(section.completionPercentage)}20`,
                          color: getStatusColor(section.completionPercentage)
                        }}
                      >
                        {section.completionPercentage}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="h-2.5 rounded-full"
                        style={{
                          width: `${section.completionPercentage}%`,
                          backgroundColor: getStatusColor(section.completionPercentage)
                        }}
                      ></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Network Functions List */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h2 className="text-xl font-semibold text-gray-800">Network Functions</h2>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
              {/* Expand All button */}
              <button
                onClick={toggleAllFunctions}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-300 text-blue-700 text-sm rounded-lg hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {allExpanded ? "Collapse All" : "Expand All"}
              </button>

              {/* Export button */}
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-300 text-green-700 text-sm rounded-lg hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 w-full sm:w-auto"
              >
                <FileSpreadsheet size={18} />
                Export to CSV
              </button>
              {/* Search bar */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search functions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {currentFunctions.map(func => (
              <div
                key={func.id}
                className={`border rounded-lg ${selectedFunction === func.id ? 'border-blue-500 shadow-lg' : 'border-gray-200'} transition-all duration-200`}
              >
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => toggleFunction(func.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {getStatusIcon(func.completionPercentage)}
                      <div>
                        <h3 className="font-medium text-gray-800">{func.name}</h3>
                        <div className="flex gap-4 mt-1">
                          <span className="text-sm text-gray-600">Vendor: {func.vendor || 'Not specified'}</span>
                          <span className="text-sm text-gray-600">Versions: {versions[func.id]?.length || 0}</span>
                        </div>
                        <div className="flex gap-4 mt-1">
                          <span className="text-sm text-gray-600">Manual: {func.manualSteps}</span>
                          <span className="text-sm text-gray-600">Automated: {func.automatedSteps}</span>
                          <span className="text-sm text-blue-600">Auto Rate: {func.automationPercentage}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Completion</div>
                        <div className="font-medium text-gray-800">{func.completionPercentage}%</div>
                      </div>
                      <span className="text-sm text-blue-700">
                        {expandedFunction === func.id ? "Collapse" : "Expand"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded version list */}
                {(expandedFunction === func.id || allExpanded) && (
                  <div className="border-t border-gray-200 px-4 pb-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3 pt-4">
                      <h4 className="font-medium text-gray-800">Version Details</h4>
                      {selectedVersion && (
                        <button
                          className="text-sm text-blue-500 hover:text-blue-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVersion(null);
                          }}
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                    {versions[func.id] && versions[func.id].length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {versions[func.id].map(version => (
                          <div
                            key={version.id}
                            className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 ${selectedVersion === version.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                              }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              selectVersion(version.id);
                            }}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-medium text-gray-800">{version.name}</span>
                              <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${version.completionPercentage < 30 ? 'bg-red-100 text-red-700' :
                                version.completionPercentage < 70 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                {version.completionPercentage}%
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="bg-white rounded-md p-1.5 shadow-sm">
                                <div className="text-gray-500 text-xs">Manual Steps</div>
                                <div className="font-medium text-gray-800">{version.manualSteps}</div>
                              </div>
                              <div className="bg-white rounded-md p-1.5 shadow-sm">
                                <div className="text-gray-500 text-xs">Automated Steps</div>
                                <div className="font-medium text-gray-800">{version.automatedSteps}</div>
                              </div>
                              <div className="col-span-2 bg-white rounded-md p-1.5 shadow-sm">
                                <div className="text-gray-500 text-xs">Automation Rate</div>
                                <div className="font-medium text-gray-800">{version.automationPercentage}%</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-4">
                        No version data available
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* No results message */}
            {filteredFunctions.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No functions found matching your criteria
              </div>
            )}
          </div>

          {/* Pagination controls */}
          {filteredFunctions.length > 0 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-6 gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Show:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-1.5"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
                <span className="text-sm text-gray-600">entries</span>
              </div>

              <div className="flex items-center">
                {/* <button
        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
        disabled={currentPage === 1}
        className={`px-2 py-1 rounded-lg ${currentPage === 1
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
      >
        <ChevronLeft size={16} />
      </button> */}

      {/* Material-UI Pagination */}
      <Pagination
        count={totalPages} // Number of total pages
        page={currentPage} // Current page
        onChange={(_, value) => setCurrentPage(value)} // Page change handler
        siblingCount={1} // Shows one page before and after current page
        boundaryCount={1} // Shows one page at the beginning and end
        shape="rounded" // Rounded edges
        color="primary" // Color for active page
        className="mx-2" // Margin between the previous button and pagination buttons
        // hideNextButton // Hides the default "Next" button of Material UI (we'll use custom one)
        // hidePrevButton // Hides the default "Previous" button of Material UI (we'll use custom one)
      />

      {/* Next Button */}
      {/* <button
        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
        disabled={currentPage === totalPages}
        className={`px-2 py-1 rounded-lg ${currentPage === totalPages
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
      >
        <ChevronRight size={16} />
      </button> */}
              </div>

              <div className="text-sm text-gray-600 whitespace-nowrap">
                Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredFunctions.length)} of {filteredFunctions.length} entries
              </div>
            </div>
          )}
        </div>

        {/* Modal for expanded view - keep this */}
        {expandedPanel && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">
                  {expandedPanel === 'overall'
                    ? (selectedFunction
                      ? `${networkFunctions.find(f => f.id === selectedFunction)?.name || ''} ${selectedVersion
                        ? `(${versions[selectedFunction]?.find(v => v.id === selectedVersion)?.name || ''})`
                        : ''}`
                      : 'Overall Progress')
                    : 'Section Progress'}
                </h2>
                <button
                  onClick={() => setExpandedPanel(null)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-lg"
                >
                  Close
                </button>
              </div>

              {expandedPanel === 'overall' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Expanded Pie Chart */}
                  <div className="h-96 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Completed', value: overallCompletion },
                            { name: 'Remaining', value: 100 - overallCompletion }
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={90}
                          outerRadius={120}
                          fill="#8884d8"
                          paddingAngle={5}
                          dataKey="value"
                        >
                          <Cell fill="#06D6A0" />
                          <Cell fill="#EEEEEE" />
                        </Pie>
                        <Tooltip />
                        <text
                          x="50%"
                          y="50%"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="text-3xl font-bold"
                          fill="#333333"
                        >
                          {overallCompletion}%
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="text-center mt-2">
                      <p className="text-gray-600">Overall Completion</p>
                    </div>
                  </div>

                  {/* Expanded Bar Chart */}
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={getFilteredByVendorAndNF().map(f => ({
                          name: f.name,  // Use full name
                          completion: f.completionPercentage
                        }))}
                        margin={{ top: 20, right: 30, left: 20, bottom: 90 }}  // Larger bottom margin for modal
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="name"
                          angle={-45}  // Rotate labels
                          textAnchor="end"  // Align the end of text with the tick
                          height={80}  // Increase height for rotated labels
                          tick={{ fontSize: 11 }}  // Slightly larger font for the modal
                        />
                        <YAxis domain={[0, 100]} />
                        <Tooltip formatter={(value) => [`${value}%`, 'Completion']} />
                        <Bar dataKey="completion" name="Completion %" fill="#8884d8">
                          {getFilteredByVendorAndNF().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getStatusColor(entry.completionPercentage)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pr-2">
                  {getSectionProgressByVendor().map((section, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-6">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-medium text-xl text-gray-800">{section.name}</span>
                        <span
                          className="text-base font-medium px-3 py-1 rounded-full"
                          style={{
                            backgroundColor: `${getStatusColor(section.completionPercentage)}20`,
                            color: getStatusColor(section.completionPercentage)
                          }}
                        >
                          {section.completionPercentage}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div
                          className="h-4 rounded-full"
                          style={{
                            width: `${section.completionPercentage}%`,
                            backgroundColor: getStatusColor(section.completionPercentage)
                          }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default NaaviDashboard;