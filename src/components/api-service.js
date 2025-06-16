// Base API URL - replace with your actual API endpoint
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ;

export { API_BASE_URL };

/**
 * Fetches questionnaire data for a specific network function and version
 * @param {string} networkFunction - The network function name
 * @param {string} version - The version of the network function
 * @param {string} section - Optional specific section to fetch
 * @returns {Promise<Object>} - The questionnaire data
 */
export const fetchQuestionnaireData = async (networkFunction, version, section = null) => {
  try {
    // Create URL with query parameters - handle relative URLs properly
    let url;

    if (API_BASE_URL) {
      // If base URL is provided, use it
      url = new URL(`${API_BASE_URL}/api/questionnaire`);
    } else {
      // For relative paths, use the current origin
      url = new URL('/api/questionnaire', window.location.origin);
    }

    // Use the correct parameter names that match the Python backend
    url.searchParams.append('nfName', networkFunction);
    url.searchParams.append('version', version);

    // Add section parameter if provided
    if (section) {
      url.searchParams.append('section', section);
    }

    // Make the API request
    const response = await fetch(url);

    // Clone the response so we can read the body multiple times
    const responseClone = response.clone();
    const rawBody = await responseClone.text();

    // Handle error responses
    if (!response.ok) {
      // Try to parse as JSON, but if it fails, use the raw text
      try {
        const errorData = JSON.parse(rawBody);
        throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
      } catch (jsonError) {
        // If JSON parsing fails, use the raw text
        throw new Error(`API error: ${response.status} ${response.statusText}. Response was not valid JSON.`);
      }
    }

    // Try to parse the response as JSON
    try {
      const data = JSON.parse(rawBody);
      return data;
    } catch (jsonError) {
      console.error('Failed to parse response as JSON:', jsonError);
      throw new Error('Response is not valid JSON. Check API endpoint and content type.');
    }
  } catch (error) {
    console.error("Error fetching questionnaire data:", error);
    throw error;
  }
};

export const uploadFile = async (file, networkFunction, version, sectionName, questionId) => {
  try {
    // Validate input parameters
    if (!file) {
      console.error('No file provided');
      return {
        success: false,
        status: 400,
        data: { message: 'No file provided' }
      };
    }

    // Create FormData object
    const formData = new FormData();

    // Append file with correct key
    formData.append('file', file, file.name);

    // Add required metadata
    formData.append('nf_name', networkFunction || '');
    formData.append('version', version || '');
    formData.append('section', sectionName || '');
    formData.append('questionId', questionId || '')

    // Prepare fetch options with more comprehensive error handling
    const fetchOptions = {
      method: 'POST',
      body: formData,
      // Optional: Add timeout to prevent hanging
      signal: AbortSignal.timeout(30000) // 30-second timeout
    };

    // Make the API request
    let response;
    try {
      response = await fetch(`${API_BASE_URL}/api/upload`, fetchOptions);
    } catch (fetchError) {
      console.error('Fetch Error:', fetchError.message);

      // Network-level errors
      return {
        success: false,
        status: 0,
        data: {
          message: `Network Error: ${fetchError.message}`,
          details: fetchError.name === 'AbortError'
            ? 'Request timed out'
            : 'Unable to reach the server'
        }
      };
    }

    // Handle 500 Internal Server Error
    if (response.status === 500) {
      const errorText = await response.text();
      console.error('Internal Server Error:', errorText);

      return {
        success: false,
        status: 500,
        data: {
          message: 'Internal Server Error',
          details: errorText
        }
      };
    }

    // Check content type
    const contentType = response.headers.get('content-type') || '';

    // If response is not JSON, attempt to read as text
    if (!contentType.includes('application/json')) {
      const responseText = await response.text();
      console.error('Non-JSON Response:', responseText);

      return {
        success: false,
        status: response.status,
        data: {
          message: 'Received non-JSON response',
          responseText: responseText
        }
      };
    }

    // Try to parse JSON response
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('JSON Parsing Error:', parseError);
      const responseText = await response.text();

      return {
        success: false,
        status: response.status,
        data: {
          message: 'Failed to parse JSON response',
          responseText: responseText
        }
      };
    }

    // Return formatted response
    return {
      success: response.ok,
      status: response.status,
      data: data,
      message: data.message || 'Unknown response'
    };
  } catch (error) {
    // Catch-all error handler
    console.error("Unexpected Error during file upload:", error.message);

    return {
      success: false,
      status: 500,
      data: {
        message: error.message,
        name: error.name
      },
      error: error
    };
  }
};

/**
 * Deletes a file from the server using the API endpoint
 * @param {string} fileName - The name of the file to delete
 * @param {string} networkFunction - The network function name
 * @param {string} version - The version
 * @param {string} sectionName - The section name
 * @returns {Promise<Object>} - Response indicating success or failure
 */
export const deleteFile = async (fileName, networkFunction, version, sectionName) => {
  try {
    // Build the API URL with the correct base
    const deleteUrl = new URL(`${API_BASE_URL}/api/delete_file`);

    // Add required query parameters that match the Flask endpoint
    deleteUrl.searchParams.append('nf_name', networkFunction);
    deleteUrl.searchParams.append('version_name', version);
    deleteUrl.searchParams.append('section', sectionName);
    deleteUrl.searchParams.append('file_name', fileName);

    // Make the DELETE request
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      // No body needed for DELETE with query parameters
    });

    // Get the response text
    const responseText = await response.text();

    // Try to parse as JSON if possible
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      responseData = { message: responseText || 'No response body' };
    }

    // Success case
    if (response.ok) {
      return {
        success: true,
        data: responseData,
        message: responseData.message || `File ${fileName} deleted successfully`
      };
    }
    // Error case
    else {
      return {
        success: false,
        status: response.status,
        data: responseData,
        message: responseData.error || `Failed to delete file ${fileName}`
      };
    }
  } catch (error) {
    console.error("Error deleting file:", error.message);
    return {
      success: false,
      error: error.message,
      message: `Error deleting file: ${error.message}`
    };
  }
};


/**
 * Downloads a file from the server
 * @param {string} fileName - The name of the file to download
 * @param {string} networkFunction - The network function name
 * @param {string} version - The version
 * @param {string} sectionName - The section name
 * @returns {void} - Initiates file download in browser
 */
export const downloadFile = (fileName, networkFunction, version, sectionName) => {
  try {
    // Build the API URL with the correct base
    const downloadUrl = new URL(`${API_BASE_URL}/api/download_file`);

    // Add required query parameters that match the Flask endpoint
    downloadUrl.searchParams.append('nf_name', encodeURIComponent(networkFunction));
    downloadUrl.searchParams.append('version_name', encodeURIComponent(version));
    downloadUrl.searchParams.append('section', encodeURIComponent(sectionName));
    downloadUrl.searchParams.append('file_name', encodeURIComponent(fileName));

    // Open the download in a new tab/window
    window.open(downloadUrl.toString(), '_blank');
  } catch (error) {
    console.error("Error initiating download:", error.message);
    alert(`Error initiating file download: ${error.message}`);
  }
};


/**
 * Fetches the list of network functions and their versions from the API
 * @returns {Promise<Array>} - Array of network functions with their versions
 */
export const fetchNetworkFunctionInfo = async () => {
  try {
    // Create URL with the API endpoint
    const url = new URL(`${API_BASE_URL}/api/nf_info`);

    // Make the API request
    const response = await fetch(url);

    // Handle error responses
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    // Parse the response
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching network function info:", error.message);
    throw error;
  }
};


/**
 * Saves questionnaire data to the API
 * @param {Object} data - The questionnaire data to save (network function, version, and sections)
 * @returns {Promise<Object>} - Response indicating success or failure
 */
export const saveQuestionnaireToAPI = async (data) => {
  try {
    // API endpoint for questionnaire data
    const apiUrl = `${API_BASE_URL}/api/questionnaire`;

    // Make the API call
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    // Handle API response
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
    }

    // Parse the response
    const result = await response.json();

    // Return success with the result data
    return {
      success: true,
      data: result,
      message: result.message || "Data saved successfully"
    };
  } catch (error) {
    console.error("Error saving questionnaire data:", error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

// ADDING NEW UTILITY FUNCTIONS FOR DASHBOARD INTEGRATION

/**
 * Alias for fetchNetworkFunctionInfo to match the naming convention used in the dashboard
 * @returns {Promise<Array>} - Array of network functions with their versions
 */
export const fetchNetworkFunctions = fetchNetworkFunctionInfo;

/**
 * Calculate completion percentages for each section based on questionnaire data
 * @param {Array} sections - Array of section data from questionnaire
 * @returns {Array} Array of sections with completion percentages
 */
export const calculateSectionCompletion = (sections) => {
  if (!sections || !Array.isArray(sections)) {
    return [];
  }

  return sections.map(section => {
    const totalQuestions = section.questions ? section.questions.length : 0;
    if (totalQuestions === 0) return { ...section, completionPercentage: 0 };

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

/**
 * Calculate automation percentages based on manual and automated steps
 * @param {Object} functionData - Network function data
 * @returns {number} Automation percentage
 */
export const calculateAutomationPercentage = (functionData) => {
  const manualSteps = functionData.manualSteps || 0;
  const automatedSteps = functionData.automatedSteps || 0;

  if (manualSteps + automatedSteps === 0) return 0;

  return Math.round((automatedSteps / (manualSteps + automatedSteps)) * 100);
};

/**
 * Transform raw network function data from the backend into the format expected by the dashboard
 * @param {Array} rawNfData - Raw network function data from the backend
 * @param {Array} questionnairesData - Data from all questionnaires
 * @returns {Array} Transformed network function data
 */
export const transformNetworkFunctionData = (rawNfData, questionnairesData) => {
  if (!rawNfData || !Array.isArray(rawNfData)) {
    return [];
  }

  return rawNfData.map((nf, index) => {
    // Find all questionnaires for this NF
    const nfQuestionnaires = questionnairesData.filter(q =>
      q.nfName === nf.nf_name || q.nf_name === nf.nf_name
    );

    // Get versions
    const versionsCount = nf.versions ? nf.versions.length : 0;

    // Calculate completion percentage
    let completionPercentage = 0;
    if (nfQuestionnaires.length > 0) {
      // Loop through all questionnaires for this NF
      let totalSections = 0;
      let completedSections = 0;

      nfQuestionnaires.forEach(q => {
        if (q.sections && Array.isArray(q.sections)) {
          q.sections.forEach(section => {
            totalSections++;

            // Check if section is complete
            const totalQuestions = section.questions ? section.questions.length : 0;
            if (totalQuestions === 0) return;

            const answeredQuestions = section.questions ? section.questions.filter(q =>
              q.answer &&
              (typeof q.answer === 'string' ? q.answer.trim() !== '' : true)
            ).length : 0;

            if (answeredQuestions / totalQuestions >= 0.9) { // 90% complete
              completedSections++;
            }
          });
        }
      });

      completionPercentage = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;
    }

    const manualSteps = 0;
    const automatedSteps = 0;
    return {
      id: index + 1,
      name: nf.nf_name || nf.name,
      versionsCount,
      completionPercentage,
      manualSteps,
      automatedSteps,
      automationPercentage: calculateAutomationPercentage({ manualSteps, automatedSteps })
    };
  });
};

/**
 * Generate version data for dashboard display based on questionnaire data
 * @param {Array} rawNfData - Raw network function data from the backend
 * @param {Array} questionnairesData - All questionnaire data
 * @returns {Object} Map of network function IDs to their version data
 */
export const generateVersionsData = (rawNfData, questionnairesData) => {
  const versionsData = {};

  rawNfData.forEach((nf, index) => {
    const nfId = index + 1;

    if (nf.versions && Array.isArray(nf.versions)) {
      versionsData[nfId] = nf.versions.map((versionName, vIdx) => {
        // Find questionnaire data for this version
        const versionQuestionnaire = questionnairesData.find(q =>
          (q.nfName === nf.nf_name || q.nf_name === nf.nf_name) &&
          ((typeof q.version === 'object' ? q.version.name : q.version) === versionName)
        );

        // Calculate completion percentage
        let completionPercentage = 0;
        if (versionQuestionnaire && versionQuestionnaire.sections) {
          const sections = calculateSectionCompletion(versionQuestionnaire.sections);
          completionPercentage = sections.reduce((acc, section) => acc + section.completionPercentage, 0) /
            Math.max(1, sections.length);
        }

        // Generate reasonable automation data
        const manualSteps = 0;
        const automatedSteps = 0;

        return {
          id: (nfId * 100) + vIdx + 1,
          name: versionName,
          completionPercentage: Math.round(completionPercentage),
          manualSteps,
          automatedSteps,
          automationPercentage: Math.round((automatedSteps / (manualSteps + automatedSteps)) * 100)
        };
      });
    }
  });

  return versionsData;
};

/**
 * Computes the completion status of a section based on answered questions
 * @param {Object} section - The section object with questions
 * @returns {String} - Status: 'completed', 'inProgress', or 'notStarted'
 */
export const getSectionStatus = (section) => {
  if (!section.questions || section.questions.length === 0) {
    return 'notStarted';
  }

  const totalQuestions = section.questions.length;
  const answeredQuestions = section.questions.filter(q =>
    q.answer &&
    (typeof q.answer === 'string' ? q.answer.trim() !== '' : true)
  ).length;

  const completionPercentage = answeredQuestions / totalQuestions;

  if (completionPercentage >= 0.9) { // 90% or more complete
    return 'completed';
  } else if (completionPercentage > 0) { // Started but less than 90% complete
    return 'inProgress';
  } else { // 0% complete
    return 'notStarted';
  }
};

/**
 * Extracts application ID from a network function name
 * @param {String} nfName - Network function name (e.g., "1A UPF", "1B SMF")
 * @returns {String} - Application ID (e.g., "1A", "1B")
 */
export const extractApplicationId = (nfName) => {
  // Extracts application ID (e.g., "1A", "1B", "2", "3", "4") 
  // Assumes format like "1A UPF", "1B SMF", etc.
  const parts = nfName.split(' ');
  return parts.length > 0 ? parts[0] : '';
};

/**
 * Fetches and computes application status data from network functions and questionnaires
 * @returns {Promise<Object>} - Object containing application status data and totals
 */
export const fetchApplicationStatusData = async () => {
  try {
    // Fetch all network functions
    const networkFunctions = await fetchNetworkFunctionInfo();

    if (!networkFunctions || !Array.isArray(networkFunctions) || networkFunctions.length === 0) {
      throw new Error('No network function data available');
    }

    // Fetch all questionnaires to determine which NFs have data
    console.log('Fetching questionnaire data for all network functions...');
    const allQuestionnaires = [];

    // For each network function, fetch questionnaire data for each version
    for (const nf of networkFunctions) {
      if (nf.versions && Array.isArray(nf.versions)) {
        for (const version of nf.versions) {
          try {
            console.log(`Fetching data for ${nf.nf_name} ${version}...`);
            const questionnaireData = await fetchQuestionnaireData(nf.nf_name, version);
            console.log(`Data received for ${nf.nf_name} ${version}:`,
              questionnaireData?.sections?.length || 0, 'sections');
            allQuestionnaires.push(questionnaireData);
          } catch (error) {
            console.warn(`Error fetching questionnaire data for ${nf.nf_name} ${version}:`, error);
            // Continue with other versions/NFs even if one fails
          }
        }
      }
    }

    // Group network functions by application ID
    const applicationGroups = {};

    networkFunctions.forEach(nf => {
      const appId = extractApplicationId(nf.nf_name);

      if (!applicationGroups[appId]) {
        applicationGroups[appId] = {
          id: appId,
          nfs: []
        };
      }

      applicationGroups[appId].nfs.push(nf);
    });

    //Calculate status counts for each application
    const applications = Object.values(applicationGroups).map(app => {
      // Count NFs that start with the application name (categorized)
      const nfCount = app.nfs.length;

      // Count NFs that have questionnaire data (in-progress)
      let inProgressCount = 0;

      // For each NF in this application group
      app.nfs.forEach(nf => {
        // Check if there's any questionnaire data for this NF
        const hasQuestionnaireData = allQuestionnaires.some(q =>
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
  } catch (error) {
    console.error('Error in fetchApplicationStatusData:', error);
    throw error;
  }
};