import React, { useState, useEffect, useRef, useCallback } from "react";
import { SectionContent, questionnaireSchemas } from "./SectionContent";
import { fetchNetworkFunctionInfo, API_BASE_URL } from "./api-service";
import { debounce } from "lodash";
import {
	Activity,
	AlertCircle,
	CheckCircle2,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Clock,
	Database,
	FileCheck,
	FileText,
	Gauge,
	HardDrive,
	HelpCircle,
	LifeBuoy,
	Map,
	RefreshCw,
	Settings,
	Terminal,
	Upload,
	Zap,
	BarChart2,
} from "lucide-react";
import Toast from "./Toast";

const NFQuestionnaire = () => {
	const sectionContentRef = useRef(null);
	// State management
	const [formData, setFormData] = useState({
		sections: [],
	});
	const [automationPayload, setAutomationPayload] = useState(null);
	const [selectedMechanisms, setSelectedMechanisms] = useState([]);
	const [otherMechanism, setOtherMechanism] = useState("");
	const [showVersionDropdown, setShowVersionDropdown] = useState(false);
	const [selectedNetworkFunction, setSelectedNetworkFunction] = useState(null);
	const [selectedVersion, setSelectedVersion] = useState(null);
	const [validationTriggered, setValidationTriggered] = useState(false);
	const [formSubmitted, setFormSubmitted] = useState({
		0: false,
		1: false,
		2: false,
		3: false,
		4: false,
		5: false,
		6: false,
		7: false,
		8: false,
		9: false,
		10: false,
		11: false,
		12: false,
	});
	const [toastMessage, setToastMessage] = useState({
		type: "error",
		text: "",
		visible: false,
	});

	const handleCloseToast = () => {
		setToastMessage((prev) => ({ ...prev, visible: false }));
	};

	const handleInvalidSections = useCallback((invalidSections) => {
		console.log("handleInvalidSections called with:", invalidSections);

		// Clean up the invalidSections object by removing any empty arrays
		const cleanedSections = {};
		let hasInvalidSections = false;

		// Only include sections that actually have invalid fields
		for (const sectionId of Object.keys(invalidSections)) {
			if (
				invalidSections[sectionId] &&
				Array.isArray(invalidSections[sectionId]) &&
				invalidSections[sectionId].length > 0
			) {
				cleanedSections[sectionId] = invalidSections[sectionId];
				hasInvalidSections = true;
			}
		}

		// Update the invalid sections map state
		setInvalidSectionsMap(cleanedSections);

		// If all sections are valid, clear any validation error message
		if (!hasInvalidSections) {
			setFormValidationError(null);
		}

		console.log("Updated invalidSectionsMap to:", cleanedSections);
	}, []);

	const [uploadedFiles, setUploadedFiles] = useState([
		{
			id: "1",
			name: "test.pdf",
			size: "2.4 MB",
			sizeInBytes: 2.4 * 1024 * 1024,
			type: "application/pdf",
			uploadDate: "3 days ago",
			checksum: "e4d909c290d0fb1ca068ffaddf22cbd0",
			artifactoryUrl: "https://artifactory.example.com/nokia/docs/test.pdf",
		},
		{
			id: "2",
			name: "config_guide.docx",
			size: "1.8 MB",
			sizeInBytes: 1.8 * 1024 * 1024,
			type: "application/msword",
			uploadDate: "2 days ago",
			checksum: "87c9eb88be7dbb6c75e15b343c702326",
			artifactoryUrl: "https://artifactory.example.com/nokia/docs/config_guide.docx",
		},
	]);
	const [hasMOPs, setHasMOPs] = useState("yes");
	const [stepsCount, setStepsCount] = useState("7");
	const [minutesCount, setMinutesCount] = useState("");
	const [hasAutomation, setHasAutomation] = useState("partial");
	const [activeSection, setActiveSection] = useState(0);
	const [showNFDropdown, setShowNFDropdown] = useState(false);
	const [invalidSectionsMap, setInvalidSectionsMap] = useState({});
	const [formValidationError, setFormValidationError] = useState(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Add new state variables for API data
	const [searchTerm, setSearchTerm] = useState("");
	const [networkFunctions, setNetworkFunctions] = useState([]);
	const [versions, setVersions] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [loadError, setLoadError] = useState(null);
	const [newVersionName, setNewVersionName] = useState("");
	const [addingVersion, setAddingVersion] = useState(false);
	const [versionNameError, setVersionNameError] = useState(null);

	// File size limits
	const maxSingleFileSizeInMB = 30;
	const maxUploadSizeInMB = 300;

	// Procedures/Sections data
	const sections = [
		{
			id: 0,
			title: "Health Check",
			description: "Routine tasks performed to ensure the NF is healthy.",
			icon: <Activity size={20} />,
			color: "blue",
		},
		{
			id: 1,
			title: "Deployment - Pre-Install Steps",
			description: "Tasks performed before installing the NF software",
			icon: <FileCheck size={20} />,
			color: "emerald",
		},
		{
			id: 2,
			title: "Deployment - Install Steps",
			description: "Tasks performed to install NF software",
			icon: <HardDrive size={20} />,
			color: "emerald",
		},
		{
			id: 3,
			title: "Deployment - Post-Install Steps",
			description: "Tasks performed to configure the NF (Day-x)",
			icon: <CheckCircle2 size={20} />,
			color: "emerald",
		},
		{
			id: 4,
			title: "Upgrade - Pre-Checks Steps",
			description: "Tasks performed before upgrading the NF software.",
			icon: <FileCheck size={20} />,
			color: "purple",
		},
		{
			id: 5,
			title: "Upgrade - Upgrade Steps",
			description: "Tasks performed to upgrade the NF software version.",
			icon: <Zap size={20} />,
			color: "purple",
		},
		{
			id: 6,
			title: "Upgrade - Post-Checks Steps",
			description: "Tasks performed after upgrading the NF software version",
			icon: <CheckCircle2 size={20} />,
			color: "purple",
		},
		{
			id: 7,
			title: "Config Audit",
			description: "Tasks performed to ensure the NF configuration aligns with the baseline or golden configuration",
			icon: <FileText size={20} />,
			color: "amber",
		},
		{
			id: 8,
			title: "Config Change",
			description: "Procedures for modifying NF parameter values",
			icon: <Settings size={20} />,
			color: "amber",
		},
		{
			id: 9,
			title: "Rollback Automations",
			description: "Tasks performed to revert the NF to a previous software or configuration version",
			icon: <RefreshCw size={20} />,
			color: "red",
		},
		{
			id: 10,
			title: "Assurance",
			description: "Opportunities for open-loop and closed-loop assurance automation",
			icon: <Gauge size={20} />,
			color: "indigo",
		},
		{
			id: 11,
			title: "Geo-Redundant/N+K",
			description: "Procedures for configuring NF to support geo-redundancy and fault tolerance",
			icon: <Map size={20} />,
			color: "cyan",
		},
		{
			id: 12,
			title: "Disaster Recovery",
			description: "Procedures for recovering the NF after a disaster",
			icon: <LifeBuoy size={20} />,
			color: "red",
		},
	];

	// Fetch network functions and versions from API when component mounts
	useEffect(() => {
		const loadNetworkFunctionInfo = async () => {
			try {
				setIsLoading(true);
				setLoadError(null);

				const data = await fetchNetworkFunctionInfo();
				if (data && Array.isArray(data)) {
					setNetworkFunctions(data);

					// Don't set any default selections - make user choose explicitly
					setSelectedNetworkFunction(null);
					setSelectedVersion(null);
					setVersions([]);
				} else {
					throw new Error("Invalid data format received from API");
				}

				setIsLoading(false);
			} catch (error) {
				console.error("Error loading network function info:", error);
				setLoadError(error.message || "Failed to load network functions");
				setIsLoading(false);

				// Set network functions but no default selections
				setNetworkFunctions([
					{ nf_name: "Nokia - 5G CHF ME", versions: [] },
					{ nf_name: "Nokia - 5G CHF RT", versions: [] },
					{ nf_name: "Nokia - 5G CHF SM", versions: [] },
					{ nf_name: "Oracle - 5G BSF", versions: [] },
					{ nf_name: "Nokia - 5G UDM", versions: [] },
				]);
				setSelectedNetworkFunction(null);
				setSelectedVersion(null);
			}
		};

		loadNetworkFunctionInfo();
	}, []);

	// Handler for Network Function selection
	const handleNetworkFunctionSelect = (nf) => {
		console.log(`Selected Network Function: ${nf}`);

		// Clear any localStorage or sessionStorage keys related to form data
		try {
			// Iterate through all localStorage keys and clear any that match your form data pattern
			Object.keys(localStorage).forEach((key) => {
				if (key.includes("formData") || key.includes("questionnaire")) {
					localStorage.removeItem(key);
				}
			});
		} catch (e) {
			console.error("Error clearing localStorage:", e);
		}

		setSelectedNetworkFunction(nf);
		setShowNFDropdown(false);
		setSearchTerm("");

		// Update versions based on selected network function
		const selectedNF = networkFunctions.find((item) => item.nf_name === nf);
		if (selectedNF) {
			const nfVersions = selectedNF.versions || [];
			setVersions(nfVersions);

			// Always reset version selection when changing network function
			setSelectedVersion(null);
		}

		// Reset form submission state when changing NF
		setFormSubmitted({
			0: false,
			1: false,
			2: false,
			3: false,
			4: false,
			5: false,
			6: false,
			7: false,
			8: false,
			9: false,
			10: false,
			11: false,
			12: false,
		});

		// Clear validation errors
		setFormValidationError(null);
		setInvalidSectionsMap({});
		setValidationTriggered(false);
	};

	// Add this after other handler functions like handleNetworkFunctionSelect
	const handleSearchChange = (e) => {
		setSearchTerm(e.target.value);
	};
	// Handler for Version selection
	const handleVersionSelect = (version) => {
		// console.log(`Selected Version: ${typeof version === "object" ? version.name : version}`);

		// Handle both object and string version formats
		const versionName = typeof version === "object" ? version.name : version;
		setSelectedVersion(versionName);

		setShowVersionDropdown(false);

		// Reset form submission state when changing version
		setFormSubmitted({
			0: false,
			1: false,
			2: false,
			3: false,
			4: false,
			5: false,
			6: false,
			7: false,
			8: false,
			9: false,
			10: false,
			11: false,
			12: false,
		});

		// Clear validation errors
		setFormValidationError(null);
		setInvalidSectionsMap({});
		setValidationTriggered(false);
	};

	// Helper function to get color class based on section
	const getSectionColorClass = (section, type) => {
		const colorMap = {
			blue: {
				bg: "bg-blue-100",
				bgDark: "bg-blue-600",
				text: "text-blue-800",
				textDark: "text-blue-600",
				border: "border-blue-200",
				hover: "hover:bg-blue-50",
				gradient: "from-blue-50 to-blue-100",
			},
			emerald: {
				bg: "bg-emerald-100",
				bgDark: "bg-emerald-600",
				text: "text-emerald-800",
				textDark: "text-emerald-600",
				border: "border-emerald-200",
				hover: "hover:bg-emerald-50",
				gradient: "from-emerald-50 to-emerald-100",
			},
			purple: {
				bg: "bg-purple-100",
				bgDark: "bg-purple-600",
				text: "text-purple-800",
				textDark: "text-purple-600",
				border: "border-purple-200",
				hover: "hover:bg-purple-50",
				gradient: "from-purple-50 to-purple-100",
			},
			amber: {
				bg: "bg-amber-100",
				bgDark: "bg-amber-600",
				text: "text-amber-800",
				textDark: "text-amber-600",
				border: "border-amber-200",
				hover: "hover:bg-amber-50",
				gradient: "from-amber-50 to-amber-100",
			},
			red: {
				bg: "bg-red-100",
				bgDark: "bg-red-600",
				text: "text-red-800",
				textDark: "text-red-600",
				border: "border-red-200",
				hover: "hover:bg-red-50",
				gradient: "from-red-50 to-red-100",
			},
			indigo: {
				bg: "bg-indigo-100",
				bgDark: "bg-indigo-600",
				text: "text-indigo-800",
				textDark: "text-indigo-600",
				border: "border-indigo-200",
				hover: "hover:bg-indigo-50",
				gradient: "from-indigo-50 to-indigo-100",
			},
			cyan: {
				bg: "bg-cyan-100",
				bgDark: "bg-cyan-600",
				text: "text-cyan-800",
				textDark: "text-cyan-600",
				border: "border-cyan-200",
				hover: "hover:bg-cyan-50",
				gradient: "from-cyan-50 to-cyan-100",
			},
		};

		return colorMap[section.color][type];
	};

	const handleSectionChange = (sectionId) => {
		// Only proceed if NF and version are selected
		if (selectedNetworkFunction && selectedVersion) {
			// Save current section data before changing sections
			if (sectionContentRef.current && sectionContentRef.current.saveData) {
				sectionContentRef.current
					.saveData()
					.then(() => {
						// If validation has been triggered, check if the current section is valid before changing
						if (validationTriggered && sectionContentRef.current && sectionContentRef.current.validateAllSections) {
							const validation = sectionContentRef.current.validateAllSections();

							// Check if current section has become valid
							const currentSectionIsValid = !validation.invalidSections[activeSection];

							if (currentSectionIsValid) {
								// Update invalidSectionsMap to remove this section
								setInvalidSectionsMap((prev) => {
									const updatedMap = { ...prev };
									delete updatedMap[activeSection];
									return updatedMap;
								});
							}
						}

						// First, clear validation state in the current section
						if (
							sectionContentRef.current &&
							sectionContentRef.current.formWithApiDataRef &&
							sectionContentRef.current.formWithApiDataRef.current
						) {
							sectionContentRef.current.formWithApiDataRef.current.clearCurrentSectionValidation();
						}

						// Change to the selected section
						setActiveSection(sectionId);

						// Scroll to top when changing sections
						window.scrollTo({ top: 0, behavior: "smooth" });

						// If this section has validation errors and validation has been triggered,
						// load them when we switch to this section
						if (validationTriggered && invalidSectionsMap[sectionId] && sectionContentRef.current) {
							// setTimeout to ensure the section content has updated
							setTimeout(() => {
								// Find the DynamicQuestionnaireForm through the SectionContent ref
								if (
									sectionContentRef.current.formWithApiDataRef &&
									sectionContentRef.current.formWithApiDataRef.current
								) {
									// Set the invalid fields for this section
									sectionContentRef.current.formWithApiDataRef.current.setInvalidFields(invalidSectionsMap[sectionId]);

									// Scroll to the first invalid field if there is one
									if (invalidSectionsMap[sectionId].length > 0) {
										const firstInvalidField = document.getElementById(invalidSectionsMap[sectionId][0]);
										if (firstInvalidField) {
											firstInvalidField.scrollIntoView({
												behavior: "smooth",
												block: "center",
											});
										}
									}
								}
							}, 200);
						} else {
							// Ensure we clear any validation state from the target section if no errors
							setTimeout(() => {
								if (
									sectionContentRef.current &&
									sectionContentRef.current.formWithApiDataRef &&
									sectionContentRef.current.formWithApiDataRef.current
								) {
									sectionContentRef.current.formWithApiDataRef.current.clearCurrentSectionValidation();
								}
							}, 200);
						}
					})
					.catch((error) => {
						console.error("Error saving section data:", error);
						// Still navigate on error
						setActiveSection(sectionId);
						window.scrollTo({ top: 0, behavior: "smooth" });
					});
			} else {
				// If no saveData method available, just navigate
				setActiveSection(sectionId);
				window.scrollTo({ top: 0, behavior: "smooth" });
			}
		}
	};

	const [completedSections, setCompletedSections] = useState({});

	const goToNextSection = useCallback(() => {
		// Only allow navigation if both NF and version are selected
		if (!selectedNetworkFunction || !selectedVersion) return;

		if (activeSection < sections.length - 1) {
			// Calculate next section index
			const nextSection = activeSection + 1;

			// Save data first
			if (sectionContentRef.current && sectionContentRef.current.saveData) {
				sectionContentRef.current
					.saveData()
					.then(() => {
						// If validation has been triggered by a submission attempt
						if (validationTriggered) {
							// Validate the current section to see if it's now valid
							if (sectionContentRef.current.validateAllSections) {
								const validation = sectionContentRef.current.validateAllSections();

								// Check if current section has become valid
								const sectionIsValid = !validation.invalidSections[activeSection];

								if (sectionIsValid) {
									// Update invalidSectionsMap to remove this section
									setInvalidSectionsMap((prev) => {
										const updatedMap = { ...prev };
										delete updatedMap[activeSection];
										return updatedMap;
									});

									// If all sections are now valid, clear the validation triggered flag
									if (Object.keys(validation.invalidSections).length === 0) {
										setValidationTriggered(false);
										setFormValidationError(null);
									}
								}
							}

							// Navigate to next section
							setActiveSection(nextSection);

							// After navigation, set invalid fields for the next section if needed
							setTimeout(() => {
								if (
									sectionContentRef.current &&
									sectionContentRef.current.formWithApiDataRef &&
									sectionContentRef.current.formWithApiDataRef.current &&
									invalidSectionsMap[nextSection]
								) {
									// console.log("Setting invalid fields for next section:", invalidSectionsMap[nextSection]);

									// Set the invalid fields for this section
									sectionContentRef.current.formWithApiDataRef.current.setInvalidFields(
										invalidSectionsMap[nextSection],
									);
								}
							}, 300); // Slightly longer delay to ensure the section change is complete

							window.scrollTo({ top: 0, behavior: "smooth" });
						} else {
							// If no validation has been triggered, just navigate
							setActiveSection(nextSection);
							window.scrollTo({ top: 0, behavior: "smooth" });
						}
					})
					.catch((error) => {
						console.error("Error saving section data:", error);
						// Still navigate on error
						setActiveSection(nextSection);
						window.scrollTo({ top: 0, behavior: "smooth" });
					});
			} else {
				// If no ref method available, just navigate
				setActiveSection(nextSection);
				window.scrollTo({ top: 0, behavior: "smooth" });
			}
		}
	}, [
		activeSection,
		sections.length,
		selectedNetworkFunction,
		selectedVersion,
		validationTriggered,
		invalidSectionsMap,
	]);

	const validateBeforeSubmit = useCallback(() => {
		console.log(sectionContentRef)
		if (sectionContentRef.current && sectionContentRef.current.validateAllSections) {
			// console.log("Validating all sections before submit");
			const validation = sectionContentRef.current.validateAllSections();

			if (!validation.isValid) {
				// console.log("Validation failed, updating UI with:", validation.invalidSections);

				// Set validation triggered flag to true
				setValidationTriggered(true);

				// Update the invalid sections map
				setInvalidSectionsMap(validation.invalidSections);

				// Count total missing fields
				const totalMissingFields = Object.values(validation.invalidSections).reduce(
					(total, fields) => total + fields.length,
					0,
				);

				// Show error message
				setFormValidationError(
					`Please fill in all required fields. ${totalMissingFields} fields are missing across ${Object.keys(validation.invalidSections).length} sections.`,
				);

				// Find the first section with errors and navigate to it
				const firstInvalidSection = Object.keys(validation.invalidSections)
					.map((sectionId) => parseInt(sectionId, 10))
					.sort((a, b) => a - b)[0];

				if (firstInvalidSection !== undefined && firstInvalidSection !== activeSection) {
					// Change to the first invalid section
					setActiveSection(firstInvalidSection);

					// After the section change, we need to set the invalid fields
					// Use setTimeout to ensure this happens after the section change is processed
					setTimeout(() => {
						if (
							sectionContentRef.current &&
							sectionContentRef.current.formWithApiDataRef &&
							sectionContentRef.current.formWithApiDataRef.current
						) {
							// Set the invalid fields for this section
							sectionContentRef.current.formWithApiDataRef.current.setInvalidFields(
								validation.invalidSections[firstInvalidSection],
							);

							// Scroll to the first invalid field
							if (validation.invalidSections[firstInvalidSection].length > 0) {
								const firstInvalidField = document.getElementById(validation.invalidSections[firstInvalidSection][0]);
								if (firstInvalidField) {
									firstInvalidField.scrollIntoView({
										behavior: "smooth",
										block: "center",
									});
								}
							}
						}
					}, 300); // Slightly longer delay to ensure the section change is complete

					window.scrollTo({ top: 0, behavior: "smooth" });
				} else if (firstInvalidSection !== undefined) {
					// We're already on the invalid section, just set the fields
					if (
						sectionContentRef.current &&
						sectionContentRef.current.formWithApiDataRef &&
						sectionContentRef.current.formWithApiDataRef.current
					) {
						sectionContentRef.current.formWithApiDataRef.current.setInvalidFields(
							validation.invalidSections[firstInvalidSection],
						);

						// Scroll to the first invalid field
						if (validation.invalidSections[firstInvalidSection].length > 0) {
							setTimeout(() => {
								const firstInvalidField = document.getElementById(validation.invalidSections[firstInvalidSection][0]);
								if (firstInvalidField) {
									firstInvalidField.scrollIntoView({
										behavior: "smooth",
										block: "center",
									});
								}
							}, 100);
						}
					}
				}

				return false;
			} else {
				// Clear any validation errors
				setInvalidSectionsMap({});
				setFormValidationError(null);
				setValidationTriggered(false);
				return true;
			}
		}

		return true;
	}, [activeSection]);

	const goToPreviousSection = useCallback(() => {
		// Only allow navigation if both NF and version are selected
		if (!selectedNetworkFunction || !selectedVersion) return;

		if (activeSection > 0) {
			// Calculate the target section index
			const previousSection = activeSection - 1;

			// Save data without clearing validation if validation has been triggered
			if (sectionContentRef.current && sectionContentRef.current.saveData) {
				sectionContentRef.current
					.saveData()
					.then(() => {
						// If validation has been triggered by a submission attempt
						if (validationTriggered) {
							// Validate the current section to see if it's now valid
							if (sectionContentRef.current.validateAllSections) {
								const validation = sectionContentRef.current.validateAllSections();

								// Check if current section has become valid
								const currentSectionIsValid = !validation.invalidSections[activeSection];

								if (currentSectionIsValid) {
									// Only update invalidSectionsMap to remove this section if it's valid
									setInvalidSectionsMap((prev) => {
										const updatedMap = { ...prev };
										delete updatedMap[activeSection];
										return updatedMap;
									});

									// If all sections are now valid, clear the validation triggered flag
									if (Object.keys(validation.invalidSections).length === 0) {
										setValidationTriggered(false);
										setFormValidationError(null);
									}
								}
							}

							// First, clear validation state in the current section
							if (
								sectionContentRef.current &&
								sectionContentRef.current.formWithApiDataRef &&
								sectionContentRef.current.formWithApiDataRef.current
							) {
								sectionContentRef.current.formWithApiDataRef.current.clearCurrentSectionValidation();
							}

							// Navigate to previous section
							setActiveSection(previousSection);

							// Set timeout to allow the section change to complete before setting invalid fields
							setTimeout(() => {
								// If the previous section has validation errors, show them
								if (
									sectionContentRef.current &&
									sectionContentRef.current.formWithApiDataRef &&
									sectionContentRef.current.formWithApiDataRef.current &&
									invalidSectionsMap[previousSection]
								) {
									// Set invalid fields for the previous section
									sectionContentRef.current.formWithApiDataRef.current.setInvalidFields(
										invalidSectionsMap[previousSection],
									);
								} else {
									// Ensure no validation errors are shown if there aren't any for this section
									if (
										sectionContentRef.current &&
										sectionContentRef.current.formWithApiDataRef &&
										sectionContentRef.current.formWithApiDataRef.current
									) {
										sectionContentRef.current.formWithApiDataRef.current.clearCurrentSectionValidation();
									}
								}
							}, 300);

							// Scroll to top
							window.scrollTo({ top: 0, behavior: "smooth" });
						} else {
							// If validation not triggered, just navigate without validation
							setActiveSection(previousSection);

							// Ensure we clear any validation state from previous section
							setTimeout(() => {
								if (
									sectionContentRef.current &&
									sectionContentRef.current.formWithApiDataRef &&
									sectionContentRef.current.formWithApiDataRef.current
								) {
									sectionContentRef.current.formWithApiDataRef.current.clearCurrentSectionValidation();
								}
							}, 300);

							window.scrollTo({ top: 0, behavior: "smooth" });
						}
					})
					.catch((error) => {
						console.error("Error saving section data:", error);
						// Still navigate on error
						setActiveSection(previousSection);
						window.scrollTo({ top: 0, behavior: "smooth" });
					});
			} else {
				// If no ref method available, just navigate
				setActiveSection(previousSection);
				window.scrollTo({ top: 0, behavior: "smooth" });
			}
		}
	}, [activeSection, selectedNetworkFunction, selectedVersion, validationTriggered, invalidSectionsMap]);

	// Add this to the component to persist all form data to local storage (optional additional layer of protection)
	useEffect(() => {
		// Create a debounced function to save form data to localStorage
		const debouncedSave = debounce(() => {
			if (sectionContentRef.current && sectionContentRef.current.getFormResponses) {
				const formData = sectionContentRef.current.getFormResponses();
				if (formData) {
					try {
						localStorage.setItem(
							`formData-${selectedNetworkFunction}-${selectedVersion}`,
							JSON.stringify(formData),
						);
						console.log("Form data saved to localStorage");
					} catch (error) {
						console.error("Error saving to localStorage:", error);
					}
				}
			}
		}, 1000); // 1 second debounce

		// Add an event listener for the beforeunload event to save data before leaving
		window.addEventListener("beforeunload", debouncedSave);

		// Save on component unmount
		return () => {
			window.removeEventListener("beforeunload", debouncedSave);
			debouncedSave.cancel();
		};
	}, [selectedNetworkFunction, selectedVersion]);

	// // And add a recovery function on initial load
	// useEffect(() => {
	//   // Only try to load if both network function and version are selected
	//   if (selectedNetworkFunction && selectedVersion) {
	//     try {
	//       const savedData = localStorage.getItem(`formData-${selectedNetworkFunction}-${selectedVersion}`);
	//       if (savedData) {
	//         const parsedData = JSON.parse(savedData);
	//         console.log('Found saved form data in localStorage:', parsedData);
	//         // You would need a way to pass this to the form component for pre-filling
	//       }
	//     } catch (error) {
	//       console.error('Error loading from localStorage:', error);
	//     }
	//   }
	// }, [selectedNetworkFunction, selectedVersion]);

	// And add a recovery function on initial load
	useEffect(() => {
		// Only try to load if both network function and version are selected
		if (selectedNetworkFunction && selectedVersion) {
			try {
				const storageKey = `formData-${selectedNetworkFunction}-${selectedVersion}`;
				const savedData = localStorage.getItem(storageKey);
				if (savedData) {
					const parsedData = JSON.parse(savedData);
					//console.log("Found saved form data in localStorage:", parsedData);

					// Log details about saved data
					//console.log("Saved Data Details:", {
					//	networkFunction: parsedData.nfName,
					//	version: parsedData.version,
					//	sections: parsedData.sections ? parsedData.sections.length : 0,
					//});

					// Optional: You can use this data to pre-fill or validate the form
					// Typically, this data would be handled by the SectionContent component
				} else {
					console.log(`No saved form data found for key: ${storageKey}`);
				}
			} catch (error) {
				console.error("Error loading from localStorage:", error);
			}
		}
	}, [selectedNetworkFunction, selectedVersion]);

	// Add this near other utility functions like getVersionsForDropdown
	const getFilteredNetworkFunctions = () => {
		if (!searchTerm.trim()) {
			return networkFunctions;
		}

		return networkFunctions.filter((nfItem) => nfItem.nf_name.toLowerCase().includes(searchTerm.toLowerCase()));
	};

	// Function to create version objects for the dropdown (only from DB, no fallbacks)
	const getVersionsForDropdown = () => {
		// Only use versions from the API
		// console.log(versions)
		if (versions && versions.length > 0) {
			return versions.map((version, index) => ({
				id: `v${index + 1}`,
				name: version.name,
			}));
		}

		// Return empty array if no versions are available
		return [];
	};

	// // Get current version for display
	// const getCurrentVersion = () => {
	// 	const versionList = getVersionsForDropdown();
	// 	return (
	// 		versionList.find((v) => v.name === selectedVersion) || {
	// 			id: "none",
	// 			name: "No version selected",
	// 		}
	// 	);
	// };

	// Function to check if the version name contains special characters
	const hasSpecialCharacters = (str) => {
		// This regex will match any character that is not a letter, number, period, or hyphen
		const regex = /[^a-zA-Z0-9.\-]/;
		return regex.test(str);
	};

	// Handler for version name input
	const handleVersionNameChange = (e) => {
		const value = e.target.value;

		// Check for special characters
		if (hasSpecialCharacters(value)) {
			console.log("Special characters detected in version name: ", value);
			console.log("Showing toast message for special characters");

			// Show toast message
			setToastMessage({
				type: "error",
				text: "Special characters are not allowed in version names. Only letters, numbers, dots, and hyphens are permitted.",
				visible: true,
			});

			console.log("Toast message state after setting: ", {
				type: "error",
				text: "Special characters are not allowed in version names. Only letters, numbers, dots, and hyphens are permitted.",
				visible: true,
			});

			// Remove special characters from the input
			const sanitizedValue = value.replace(/[^a-zA-Z0-9.\-]/g, "");
			setNewVersionName(sanitizedValue);
		} else {
			// If no special characters, update normally
			setNewVersionName(value);
		}

		// No longer need to set versionNameError since we're using toast
		setVersionNameError(null);
	};

	// Function to handle adding a new version
	const handleAddVersion = async (e) => {
		e.preventDefault();
		
		if (!newVersionName || !selectedNetworkFunction) {
			return;
		}
		// Check for special characters
		if (hasSpecialCharacters(newVersionName)) {
			// Show toast message
			setToastMessage({
				type: "error",
				text: "Special characters are not allowed in version names. Only letters, numbers, dots, and hyphens are permitted.",
				visible: true,
			});
			return;
		}

		try {
			setAddingVersion(true);
			const newVersion = { name: newVersionName, status: "Not Started", latest: false };


			// Make the API call to add the version using the imported API_BASE_URL
			const response = await fetch(`${API_BASE_URL}/api/add_version`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					nfName: selectedNetworkFunction,
					version: newVersion,
				}),
			});
			console.log(JSON.stringify({
				nfName: selectedNetworkFunction,
				version: newVersion,
			}))

			const data = await response.json();

			if (response.ok) {
				console.log("Version added successfully:", data);
				// Update local state with the new version
				console.log(newVersion)
				setVersions((prev) => [...prev, newVersion]);


				// Clear the input field
				setNewVersionName("");

				// Show success toast
				setToastMessage({
					type: "success",
					text: `Version "${newVersionName}" added successfully`,
					visible: true,
				});

				// Force a refresh by ensuring it's open, then close after a short delay
				setShowVersionDropdown(true);

				setTimeout(() => {
					setShowVersionDropdown(false);
				}, 300);
			} else {
				console.error("Error adding version:", data);

				// Show error toast instead of alert
				setToastMessage({
					type: "error",
					text: `Error adding version: ${data.error || "Unknown error"}`,
					visible: true,
				});
			}
		} catch (error) {
			console.error("Failed to add version:", error);

			// Show error toast instead of alert
			setToastMessage({
				type: "error",
				text: `Failed to add version: ${error.message}`,
				visible: true,
			});
		} finally {
			setAddingVersion(false);
		}
	};

	// Check if both NF and version are selected
	const isValidSelection = selectedNetworkFunction && selectedVersion;

	// Modified handleSubmitQuestionnaire function that saves data first before validation
	const handleSubmitQuestionnaire = useCallback(() => {
		// First, save all the data to the database regardless of validation state
		if (sectionContentRef.current && sectionContentRef.current.saveData) {
			// Show saving indicator
			setToastMessage({
				type: "info",
				text: "Saving your data before validation...",
				visible: true,
			});

			// This will save the data without marking it as "final submission"
			sectionContentRef.current
				.saveData()
				.then((savedData) => {
					// console.log("Successfully saved data before validation:", savedData);

					// Show success message for save
					setToastMessage({
						type: "success",
						text: "Your data has been saved. Now validating the form...",
						visible: true,
					});

					// Short timeout to let user see the save confirmation
					setTimeout(() => {
						// Set the validation triggered flag after saving
						setValidationTriggered(true);

						// Now validate all sections
						if (validateBeforeSubmit()) {
							// If validation passes, proceed with final submission
							if (sectionContentRef.current && sectionContentRef.current.submitQuestionnaire) {
								sectionContentRef.current
									.submitQuestionnaire()
									.then((result) => {
										if (result) {
											// If submission was successful, reset the validation triggered flag
											setValidationTriggered(false);
										}
									})
									.catch((error) => {
										console.error("Error during submission:", error);
										setToastMessage({
											type: "error",
											text: `Error during final submission: ${error.message}. Your data is still saved.`,
											visible: true,
										});
									});
							}
						} else {
							// If validation fails, show message that data is saved but validation failed
							setToastMessage({
								type: "warning",
								text: "Form has validation errors, but your data has been saved. Please fix the errors and try submitting again.",
								visible: true,
							});
						}
					}, 1000); // Short delay to show save confirmation
				})
				.catch((error) => {
					console.error("Error saving data before validation:", error);
					// Show toast message about the error
					setToastMessage({
						type: "error",
						text: `Failed to save data: ${error.message}`,
						visible: true,
					});
				});
		} else {
			// If saveData method is not available, fall back to the original behavior
			setValidationTriggered(true);

			if (validateBeforeSubmit()) {
				if (sectionContentRef.current && sectionContentRef.current.submitQuestionnaire) {
					sectionContentRef.current
						.submitQuestionnaire()
						.then((result) => {
							if (result) {
								setValidationTriggered(false);
							}
						})
						.catch((error) => {
							console.error("Error during submission:", error);
						});
				}
			}
		}
	}, [validateBeforeSubmit, setToastMessage]);


	return (
		<div className="flex flex-col min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
			{/* Header */}
			<header className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white py-4 shadow-lg z-10">
				<div className="max-w-7xl mx-auto flex items-center justify-center px-4">
					<h1 className="text-xl md:text-2xl font-bold tracking-tight">
						{selectedNetworkFunction
							? selectedVersion
								? `${selectedNetworkFunction} ${selectedVersion} Questionnaire`
								: `${selectedNetworkFunction} Questionnaire`
							: "Network Function Questionnaire"}
					</h1>
				</div>
			</header>

			{/* Main Content */}
			<main className="flex-grow p-4">
				<div className="max-w-7xl mx-auto">
					{/* Loading state */}
					{isLoading && (
						<div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200 flex justify-center items-center">
							<div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-3" />
							<span className="text-blue-600">Loading network functions...</span>
						</div>
					)}

					{/* Error state */}
					{loadError && !isLoading && (
						<div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
							<div className="flex">
								<div className="flex-shrink-0">
									<AlertCircle className="h-5 w-5 text-red-400" />
								</div>
								<div className="ml-3">
									<p className="text-sm text-red-700">{loadError}</p>
									<p className="text-xs text-red-500 mt-1">Using default values instead.</p>
								</div>
							</div>
						</div>
					)}

					{/* Network Function Selector */}
					<div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
						{/* Center the dropdowns using justify-center */}
						<div className="flex flex-col items-center">
							{/* Selection Instruction Message - Now at the top */}
							{!isValidSelection && (
								<div className="mb-6">
									<p className="text-sm text-blue-600 text-center font-medium">
										Please select Network Function and software version to continue.
									</p>
								</div>
							)}

							<div className="space-y-4 md:space-y-0 md:flex md:space-x-6 md:items-center md:justify-center">
								<div className="w-full md:w-64">
									<label className="block text-sm font-medium text-gray-700 mb-1 text-center">
										Network Function: <span className="text-red-500">*</span>
									</label>
									<div className="relative">
										<button
											onClick={() => setShowNFDropdown(!showNFDropdown)}
											disabled={isLoading}
											className={`w-full bg-white border ${!selectedNetworkFunction && formValidationError ? "border-red-300 ring-1 ring-red-300" : "border-gray-300"} rounded-md py-2 text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
										>
											<span className="flex items-center justify-center px-6">
												<span className="truncate">{selectedNetworkFunction || "Select Network Function"}</span>
											</span>
											<span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
												<ChevronDown size={16} className="text-gray-400" />
											</span>
										</button>

										{/* Dropdown */}
										{showNFDropdown && !isLoading && (
											<div className="absolute mt-1 w-full z-10 bg-white shadow-lg max-h-60 rounded-md overflow-auto focus:outline-none border border-gray-200 divide-y divide-gray-100">
												<div className="p-2 sticky top-0 bg-white border-b border-gray-200">
													<div className="relative">
														<input
															type="text"
															value={searchTerm}
															onChange={handleSearchChange}
															className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
															placeholder="Search network functions..."
														/>
													</div>
												</div>
												{getFilteredNetworkFunctions().map((nfItem, index) => (
													<div
														key={index}
														className={`p-3 cursor-pointer hover:bg-gray-50 flex items-center ${selectedNetworkFunction === nfItem.nf_name ? "bg-blue-50" : ""}`}
														onClick={() => handleNetworkFunctionSelect(nfItem.nf_name)}
													>
														{selectedNetworkFunction === nfItem.nf_name && (
															<CheckCircle2 size={16} className="mr-2 text-blue-600" />
														)}
														<span className={`ml-${selectedNetworkFunction === nfItem.nf_name ? "0" : "5"}`}>
															{nfItem.nf_name}
														</span>
													</div>
												))}
											</div>
										)}
									</div>
								</div>

								<div className="w-full md:w-64">
									<label className="block text-sm font-medium text-gray-700 mb-1 text-center">
										Software Version: <span className="text-red-500">*</span>
									</label>
									<div className="relative">
										<button
											onClick={() => setShowVersionDropdown(!showVersionDropdown)}
											disabled={isLoading || !selectedNetworkFunction}
											className={`w-full bg-white border ${!selectedVersion && formValidationError ? "border-red-300 ring-1 ring-red-300" : "border-gray-300"} rounded-md py-2 text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm ${isLoading || !selectedNetworkFunction ? "opacity-50 cursor-not-allowed" : ""}`}
										>
											<span className="flex items-center justify-center px-6">
												<span className={`font-medium ${!selectedVersion ? "text-gray-400" : ""}`}>
													{selectedVersion || "Select Version"}
												</span>
											</span>
											<span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
												<ChevronDown size={16} className="text-gray-400" />
											</span>
										</button>

										{/* Version Dropdown */}
										{showVersionDropdown && !isLoading && (
											<div className="absolute mt-1 w-full z-10 bg-white shadow-lg max-h-72 rounded-md overflow-hidden focus:outline-none border border-gray-200">
												<div className="overflow-y-auto max-h-48">
													{getVersionsForDropdown().length > 0 ? (
														getVersionsForDropdown().map((version) => (
															<div
																key={version.id}
																className={`p-3 cursor-pointer hover:bg-gray-50 ${selectedVersion === version.name ? "bg-blue-50" : ""}`}
																onClick={() => handleVersionSelect(version.name)}
															>
																<div className="flex items-center justify-between">
																	<div className="flex flex-col">
																		<span className="font-medium">{version.name}</span>
																	</div>
																</div>
															</div>
														))
													) : (
														<div className="p-3 text-gray-500 text-sm text-center italic">No versions available</div>
													)}
												</div>

												{/* Add New Version Form */}
												<div className="border-t border-gray-200 p-3 pb-6 bg-gray-50 relative">
													<div className="flex items-center">
														<input
															type="text"
															value={newVersionName}
															onChange={handleVersionNameChange}
															placeholder="Add new version..."
															className="flex-1 h-10 px-3 border border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-l text-sm focus:outline-none focus:ring-2"
															disabled={addingVersion}
														/>
														<button
															type="button"
															onClick={handleAddVersion}
															className={`h-10 bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-r text-sm font-medium flex items-center justify-center ${addingVersion || !newVersionName ? "opacity-70 cursor-not-allowed" : ""}`}
															disabled={addingVersion || !newVersionName}
														>
															{addingVersion ? (
																<div className="flex items-center space-x-1">
																	<div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
																	<span>Adding...</span>
																</div>
															) : (
																"Add"
															)}
														</button>
													</div>
												</div>
											</div>
										)}
									</div>
								</div>
							</div>

							{/* Validation error message */}
							{formValidationError && (
								<div className="mt-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700">
									<div className="flex">
										<div className="flex-shrink-0">
											<AlertCircle className="h-5 w-5 text-red-400" />
										</div>
										<div className="ml-3">
											<p className="text-sm font-medium">{formValidationError}</p>
											<p className="text-xs mt-1">
												Please check the highlighted sections and fill in the required fields.
											</p>
										</div>
									</div>
								</div>
							)}
						</div>
					</div>

					{/* Main content - Only show if both Network Function and Version are selected */}
					{isValidSelection && (
						<div className="flex flex-col lg:flex-row gap-6">
							{/* Side Navigation */}
							<div className="lg:w-64 flex-shrink-0">
								<div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200 sticky top-4">
									<div className="p-4 bg-blue-50 border-b border-blue-100">
										<h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Procedures</h3>
										<p className="text-xs text-gray-500 mt-1">
											Section {activeSection + 1} of {sections.length}
										</p>
									</div>
									<div className="max-h-[calc(100vh-250px)] overflow-y-auto">
										<nav className="py-2">
											{sections.map((section) => (
												<button
													key={section.id}
													onClick={() => handleSectionChange(section.id)}
													className={`w-full flex items-center px-4 py-3 text-sm ${
														activeSection === section.id
															? `${getSectionColorClass(section, "bg")} ${getSectionColorClass(section, "text")} font-medium border-l-4 ${getSectionColorClass(section, "border")}`
															: invalidSectionsMap[section.id]
																? "text-red-600 bg-red-50 border-l-4 border-red-400 hover:bg-red-100" // Style for sections with validation errors
																: "text-gray-600 hover:bg-gray-50"
													}`}
												>
													<div
														className={`mr-3 ${
															activeSection === section.id
																? getSectionColorClass(section, "textDark")
																: invalidSectionsMap[section.id]
																	? "text-red-500"
																	: "text-gray-400"
														}`}
													>
														{section.icon}
													</div>
													<span className="truncate">{section.title}</span>

													{invalidSectionsMap[section.id] && (
														<div className="ml-2 flex-shrink-0">
															<div
																className="w-2 h-2 rounded-full bg-red-500"
																title={`${invalidSectionsMap[section.id].length} missing required fields`}
															></div>
														</div>
													)}

													{activeSection === section.id && (
														<div className="ml-auto">
															<ChevronRight size={16} className={getSectionColorClass(section, "textDark")} />
														</div>
													)}
												</button>
											))}
										</nav>
									</div>
								</div>
							</div>

							{/* Main Content Area */}
							<div className="flex-1">
								<div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
									<div className="border-b border-gray-200 p-6">
										<div className="flex items-center justify-between">
											<div>
												<h1 className="text-2xl font-bold text-gray-800 flex items-center">
													{sections[activeSection].title}
													<span className="ml-3 text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
														Section {activeSection + 1} of {sections.length}
													</span>
												</h1>
												<p className="text-gray-600 mt-1">{sections[activeSection].description}</p>
											</div>
										</div>

										{/* Progress indicator */}
										<div className="mt-6">
											<div className="relative">
												<div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
													<div
														style={{
															width: `${((activeSection + 1) / sections.length) * 100}%`,
														}}
														className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-600"
													></div>
												</div>
												<div className="flex justify-between text-xs text-gray-500 mt-1">
													<span>Start</span>
													<span>Complete</span>
												</div>
											</div>
										</div>
									</div>

									<div className="p-6">
										{/* Use the component with proper PascalCase naming */}
										<SectionContent
											ref={sectionContentRef} 
											activeSection={activeSection}
											goToNextSection={goToNextSection}
											goToPreviousSection={goToPreviousSection}
											networkFunction={selectedNetworkFunction}
											version={selectedVersion}
											onInvalidSections={handleInvalidSections}
											onSubmit={handleSubmitQuestionnaire}
										/>
									</div>
								</div>

								{/* Submit button - Shown at the bottom of all sections */}
							</div>
						</div>
					)}
				</div>
			</main>

			{/* Footer */}
			<footer className="bg-gray-800 text-gray-400 py-3 text-xs mt-8">
				<div className="max-w-7xl mx-auto px-4 flex justify-center items-center">
					<span className="text-gray-300">© 2025 All rights reserved.</span>
				</div>
			</footer>
			<Toast message={toastMessage} onClose={handleCloseToast} />
		</div>
	);
};

export default NFQuestionnaire;
