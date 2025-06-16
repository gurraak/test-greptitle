import React, { useState, useEffect, useRef, useImperativeHandle } from "react";
import DynamicQuestionnaireForm from "./DynamicQuestionnaireForm";
import questionnaireSchemas, { sectionInfo } from "./questionnaireSchemas";
import { fetchQuestionnaireData } from "./api-service";
import { debounce } from "lodash";

// Main content component that selects and displays the proper form based on active section
const SectionContent = React.forwardRef(
	({ activeSection, goToNextSection, goToPreviousSection, networkFunction, version, onSubmit }, ref) => {
		const [apiData, setApiData] = useState(null);
		const [loading, setLoading] = useState(true);
		const [error, setError] = useState(null);
		const [resetCounter, setResetCounter] = useState(0); // Add a reset counter to force re-renders

		// Track network function and version changes to determine when to reset
		const prevNFRef = useRef(networkFunction);
		const prevVersionRef = useRef(version);
		// console.log("VERSION\n\n\n\n\n\n" + version);
		// Debug helper function to log section data

		const logSectionData = (message, data) => {
			// console.log(`[SectionContent] ${message}:`, data);
		};

		function updateLocalStorageWithFiles(networkFunction, version, apiData) {
			try {
				
				// First, get the existing form data from localStorage
				const storageKey = `formData-${networkFunction}-${version}`;
				let existingData = null;

				try {
					const savedData = localStorage.getItem(storageKey);
					if (savedData) {
						existingData = JSON.parse(savedData);
						console.log("Found saved form data in localStorage:", existingData);
					}
				} catch (error) {
					console.error("Error parsing localStorage data:", error);
					existingData = {
						nfName: networkFunction,
						version: version,
						sections: [],
					};
				}

				// If no existing data, create new structure
				if (!existingData) {
					existingData = {
						nfName: networkFunction,
						version: version,
						sections: [],
					};
				}

				// Now, for each section in the API data, add the files
				if (apiData?.sections) {
					apiData.sections.forEach((apiSection) => {
						// Find matching section in existing data
						const sectionName = apiSection.section_name || apiSection.sectionName;
						let existingSection = existingData.sections.find(
							(section) => (section.sectionName || section.section_name) === sectionName,
						);

						// If section doesn't exist, create it
						if (!existingSection) {
							existingSection = {
								sectionName: sectionName,
								questions: [],
							};
							existingData.sections.push(existingSection);
						}

						// Add files array to the section if it doesn't exist
						if (!existingSection.files) {
							existingSection.files = [];
						}

						// Add or update files from API if they exist
						if (apiSection.files && apiSection.files.length > 0) {
							console.log(`Adding ${apiSection.files.length} files for section ${sectionName}`);

							apiSection.files.forEach((file) => {
								// First, remove any existing file with the same filename to avoid duplicates
								existingSection.files = existingSection.files.filter(
									(existingFile) => existingFile.filename !== file.filename,
								);

								// Add the new file
								existingSection.files.push(file);
							});
						}

						// Update questions from API if they exist
						if (apiSection.questions && apiSection.questions.length > 0) {
							// Either update existing questions or create new ones
							if (!existingSection.questions || existingSection.questions.length === 0) {
								existingSection.questions = apiSection.questions;
							} else {
								// Merge questions, updating existing ones and adding new ones
								apiSection.questions.forEach((apiQuestion) => {
									const existingQuestionIndex = existingSection.questions.findIndex(
										(q) => q.questionId === apiQuestion.questionId,
									);

									if (existingQuestionIndex >= 0) {
										// Update existing question
										existingSection.questions[existingQuestionIndex] = apiQuestion;
									} else {
										// Add new question
										existingSection.questions.push(apiQuestion);
									}
								});
							}
						}
					});
				}
				
				// Save updated data back to localStorage
				localStorage.setItem(storageKey, JSON.stringify(existingData));
				console.log("Updated localStorage with file data:", existingData);

				return existingData;
			} catch (error) {
				console.error("Error updating localStorage with files:", error);
				return null;
			}
		}

		useEffect(() => {
			// Only set up the timer if resetCounter is greater than 0
			if (resetCounter > 0) {
				console.log("Reset counter is active, will be cleared soon...");
				// Set a timeout to clear the reset flag after the initial reset is processed
				const timer = setTimeout(() => {
					console.log("Clearing reset counter");
					setResetCounter(0);
				}, 500); // Give enough time for the child component to process the reset

				return () => clearTimeout(timer);
			}
		}, [resetCounter]);

		// Fetch questionnaire data from API when component mounts or when NF/version changes
		// useEffect(() => {
		//   // Check if NF or version has changed, requiring a reset
		//   const needsReset = prevNFRef.current !== networkFunction || prevVersionRef.current !== version;

		//   // Update refs with current values
		//   prevNFRef.current = networkFunction;
		//   prevVersionRef.current = version;

		//   // Only clear localStorage if NF or version has changed
		//   if (needsReset && window.localStorage) {
		//     try {
		//       console.log('Network function or version changed - clearing specific localStorage data');
		//       // Only clear localStorage data for the previous NF/version
		//       Object.keys(window.localStorage).forEach(key => {
		//         if (key.includes(`formData-${prevNFRef.current}`) ||
		//           key.includes(`questionnaire-${prevNFRef.current}`)) {
		//           console.log(`Clearing localStorage key: ${key}`);
		//           window.localStorage.removeItem(key);
		//         }
		//       });
		//     } catch (e) {
		//       console.error('Error clearing localStorage:', e);
		//     }
		//   }

		//   // Force component re-render to reset form state
		//   if (needsReset) {
		//     setResetCounter(prev => prev + 1);
		//   }

		//   // Only attempt to load data if both networkFunction and version are provided
		//   if (networkFunction && version) {
		//     const loadQuestionnaireData = async () => {
		//       try {
		//         setLoading(true);
		//         setError(null);

		//         console.log(`Fetching questionnaire data for: ${networkFunction}, version: ${version}`);

		//         const data = await fetchQuestionnaireData(networkFunction, version);

		//         console.log('Questionnaire data fetched successfully:', data);
		//         // Log available section names for debugging
		//         if (data && data.sections) {
		//           const sectionNames = data.sections.map(s => s.section_name || s.sectionName);
		//           logSectionData("Available sections in API response", sectionNames);
		//         }

		//         setApiData(data);
		//         setLoading(false);
		//       } catch (error) {
		//         console.error("Error fetching questionnaire data:", error);
		//         setError(`Failed to load saved form data: ${error.message}`);
		//         setLoading(false);

		//         // Reset API data on error
		//         setApiData(null);
		//       }
		//     };

		//     loadQuestionnaireData();
		//   } else {
		//     // Reset state if networkFunction or version is missing
		//     console.log('Missing networkFunction or version - resetting data');
		//     setApiData(null);
		//     setLoading(false);
		//     if (!networkFunction && !version) {
		//       setError("Please select a Network Function and Version");
		//     } else if (!networkFunction) {
		//       setError("Please select a Network Function");
		//     } else {
		//       setError("Please select a Version");
		//     }
		//   }
		// }, [networkFunction, version]);

		useEffect(() => {
			// Check if NF or version has changed, requiring a reset
			const needsReset = prevNFRef.current !== networkFunction || prevVersionRef.current !== version;

			// Update refs with current values
			prevNFRef.current = networkFunction;
			prevVersionRef.current = version;

			// Only clear localStorage if NF or version has changed
			if (needsReset && window.localStorage) {
				try {
					console.log("Network function or version changed - clearing specific localStorage data");
					// Only clear localStorage data for the previous NF/version
					Object.keys(window.localStorage).forEach((key) => {
						if (key.includes(`formData-${prevNFRef.current}`) || key.includes(`questionnaire-${prevNFRef.current}`)) {
							console.log(`Clearing localStorage key: ${key}`);
							window.localStorage.removeItem(key);
						}
					});
				} catch (e) {
					console.error("Error clearing localStorage:", e);
				}
			}

			// Force component re-render to reset form state
			if (needsReset) {
				setResetCounter((prev) => prev + 1);
			}

			// Only attempt to load data if both networkFunction and version are provided
			if (networkFunction && version) {
				const loadQuestionnaireData = async () => {
					try {
						setLoading(true);
						setError(null);

						console.log(`Fetching questionnaire data for: ${networkFunction}, version: ${version}`);

						const data = await fetchQuestionnaireData(networkFunction, version);
						console.log("Questionnaire data fetched successfully:", data);

						// Update localStorage with the API data including files
						if (data && data.sections) {
							// Use the updateLocalStorageWithFiles function to properly merge data
							
							updateLocalStorageWithFiles(networkFunction, version, data);
						}

						setApiData(data);
						setLoading(false);
					} catch (error) {
						console.error("Error fetching questionnaire data:", error);
						setError(`Failed to load saved form data: ${error.message}`);
						setLoading(false);
						setApiData(null);
					}
				};

				loadQuestionnaireData();
			} else {
				// Reset state if networkFunction or version is missing
				console.log("Missing networkFunction or version - resetting data");
				setApiData(null);
				setLoading(false);
				if (!networkFunction && !version) {
					setError("Please select a Network Function and Version");
				} else if (!networkFunction) {
					setError("Please select a Network Function");
				} else {
					setError("Please select a Version");
				}
			}
		}, [networkFunction, version]);

		// Find API data for the current section based on section mapping
		const getCurrentSectionApiData = () => {
			if (!apiData || !apiData.sections) {
				console.log("No API data available for current section");
				return null;
			}

			// Map each section ID to its corresponding API section name
			const sectionMapping = {
				0: "healthcheck",
				1: "preinstall",
				2: "install",
				3: "postinstall",
				4: "preupgrade",
				5: "upgrade",
				6: "postupgrade",
				7: "configaudit",
				8: "configchange",
				9: "rollback",
				10: "assurance",
				11: "georedundant",
				12: "disasterrecovery",
			};

			const sectionName = sectionMapping[activeSection];
			if (!sectionName) {
				console.log(`No section mapping found for section ID ${activeSection}`);
				return null;
			}

			let sectionData = null;

			// Log all section names for debugging
			apiData.sections.forEach((section, index) => {
				const actualSectionName = section.section_name || section.sectionName || "";
				logSectionData(`Section ${index}`, {
					expectedName: sectionName,
					actualName: actualSectionName,
					matches: actualSectionName.toLowerCase() === sectionName.toLowerCase(),
				});
			});

			// Improved section matching logic with explicit string normalization
			sectionData = apiData.sections.find((section) => {
				// Get section name with fallback, ensuring we have a string to work with
				const sectionNameValue = (section.section_name || section.sectionName || "").toString().trim().toLowerCase();
				const targetSectionName = sectionName.toString().trim().toLowerCase();

				// More explicit matching with logging
				const isMatch = sectionNameValue === targetSectionName;
				if (isMatch) {
					logSectionData(`Found matching section: ${sectionNameValue}`, section);
				}
				return isMatch;
			});


			// Additional logging for troubleshooting
			if (!sectionData) {
				logSectionData(`Section data for "${sectionName}" not found in API response`, {
					availableSections: apiData.sections.map((s) => s.section_name || s.sectionName),
				});
			} else {
				logSectionData(`Section data for "${sectionName}" found:`, sectionData);
			}
			return sectionData;
		};

		// Pass the questionnaire data to the form component
		const formWithApiDataRef = useRef(null);

		// useImperativeHandle in SectionContent component to pass invalid sections to parent
		React.useImperativeHandle(
			ref,
			() => ({
				clearCurrentSectionValidation: () => {
					if (formWithApiDataRef.current && formWithApiDataRef.current.clearCurrentSectionValidation) {
						formWithApiDataRef.current.clearCurrentSectionValidation();
					}
				},
				getFormResponses: () => {
					if (formWithApiDataRef.current) {
						return formWithApiDataRef.current.getFormResponses();
					}
					return null;
				},
				saveData: () => {
					if (formWithApiDataRef.current) {
						return formWithApiDataRef.current.saveData();
					}
					return null;
				},
				submitQuestionnaire: () => {
					if (formWithApiDataRef.current) {
						return formWithApiDataRef.current.submitQuestionnaire();
					}
					return null;
				},
				clearValidationState: () => {
					// Clear validation state in the form component
					if (formWithApiDataRef.current && formWithApiDataRef.current.clearCurrentSectionValidation) {
						formWithApiDataRef.current.clearCurrentSectionValidation();
					}

					// Clear parent validation state if available
					if (ref.current && ref.current.onInvalidSections) {
						ref.current.onInvalidSections({});
					}
				},
				clearCurrentSectionValidation: () => {
					if (formWithApiDataRef.current && formWithApiDataRef.current.clearCurrentSectionValidation) {
						formWithApiDataRef.current.clearCurrentSectionValidation();
					}
				},
				validateAllSections: () => {
					if (formWithApiDataRef.current && formWithApiDataRef.current.validateAllSections) {
						return formWithApiDataRef.current.validateAllSections();
					}
					return { isValid: true, invalidSections: {} };
				},
				updateInvalidSections: (invalidSections) => {
					console.log("SectionContent.updateInvalidSections called with:", invalidSections);
					// Pass up to the parent component
					if (ref.current && ref.current.onInvalidSections) {
						ref.current.onInvalidSections(invalidSections);
					}
				},
				// Expose the formWithApiDataRef so we can access it from parent
				formWithApiDataRef: formWithApiDataRef,
			}),
			[formWithApiDataRef],
		);

		// Get section data for the current active section
		const currentSectionData = getCurrentSectionApiData();

		// console.log("---- DEBUG INFO ----");
		// console.log("Current Section ID:", activeSection);
		// console.log("Current Section Name:", questionnaireSchemas[activeSection]?.sectionName);
		// console.log("Current Section Data being passed to form:", currentSectionData);
		// if (currentSectionData && currentSectionData.questions) {
		// 	console.log("Number of questions in API data:", currentSectionData.questions.length);
		// 	console.log("Sample question data:", currentSectionData.questions[0]);
		// } else {
		// 	console.log("No questions available in current section data");
		// }

		// Include key that changes ONLY when network function or version changes
		// NOT when section changes (to preserve data between section navigation)
		const formKey = `${networkFunction}-${version}-${resetCounter}`;


		return (
			<>
				{loading && (
					<div className="flex justify-center items-center p-8">
						<div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
						<span className="ml-3 text-blue-600">Loading saved questionnaire data...</span>
					</div>
				)}

				{error && !loading && (
					<div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
						<div className="flex">
							<div className="flex-shrink-0">
								<svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
									<path
										fillRule="evenodd"
										d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
										clipRule="evenodd"
									/>
								</svg>
							</div>
							<div className="ml-3">
								<p className="text-sm text-red-700">{error}</p>
							</div>
						</div>
					</div>
				)}

				<DynamicQuestionnaireForm
					key={formKey}
					ref={formWithApiDataRef}
					activeSection={activeSection}
					goToNextSection={goToNextSection}
					goToPreviousSection={goToPreviousSection}
					apiSectionData={currentSectionData}
					initializing={loading}
					networkFunction={networkFunction}
					versionNumber={version}
					forceReset={resetCounter > 0}
					onSubmit={onSubmit}
				/>
			</>
		);
	},
);

// Helper function to print the form data object for debugging
const debugJsonPayload = () => {
	if (window.sectionContentRef) {
		const allData = window.sectionContentRef.getFormResponses();
		console.log(
			"%c Complete Questionnaire JSON Payload from Debug Function:",
			"color: blue; font-weight: bold; font-size: 14px;",
		);
		console.log(JSON.stringify(allData, null, 2));
		return allData;
	}
	return null;
};

export { SectionContent, questionnaireSchemas, sectionInfo, debugJsonPayload };

