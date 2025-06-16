import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import questionnaireSchemas, { getIconComponent } from "./questionnaireSchemas";
import { CheckCircle2, Upload, AlertCircle, X } from "lucide-react";
import Toast from "./Toast";
import SaveButton from "./SaveButton";
import { uploadFile, deleteFile, downloadFile, saveQuestionnaireToAPI } from "./api-service";
import { debounce } from "lodash";

// Dynamic Questionnaire Component
const DynamicQuestionnaireForm = React.forwardRef(
	(
		{
			activeSection,
			goToNextSection,
			goToPreviousSection,
			apiSectionData,
			initializing = false,
			networkFunction = "Nokia - 5G CHF ME",
			versionNumber = { name: "v1.0.0", latest: false, status: "Not Started" },
			forceReset = null,
			onSubmit,
		},
		ref,
	) => {
		// Get the schema for the active section
		const schema = questionnaireSchemas[activeSection];

		const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

		// Use refs for data that should not trigger re-renders
		const sectionDataRef = useRef({});
		useLayoutEffect(() => {
			if (!sectionDataRef.current[activeSection]) {
				sectionDataRef.current[activeSection] = {
					responses: {},
					mechanisms: [],
					otherMechanism: "",
				};
			}
		}, [activeSection]);

		// These states should update the UI when changed
		const resetRequiredRef = useRef(false);
		const resetSectionRef = useRef(null);
		const processedResetRef = useRef(false);
		const visibilityUpdateInProgressRef = useRef(false);
		const [uploading, setUploading] = useState(false);
		const [uploadProgress, setUploadProgress] = useState({});
		const [localFormData, setLocalFormData] = useState({});
		const [invalidFields, setInvalidFields] = useState([]);
		const [invalidSectionsMap, setInvalidSectionsMap] = useState({});
		const [visibleQuestions, setVisibleQuestions] = useState({});
		const [selectedMechanisms, setSelectedMechanisms] = useState({});
		const [otherMechanism, setOtherMechanism] = useState({});
		const [uploadedFiles, setUploadedFiles] = useState([]);
		const [isSaving, setIsSaving] = useState(false);
		const [toastMessage, setToastMessage] = useState({
			type: "success",
			text: "",
			visible: false,
		});
		const [isSubmitting, setIsSubmitting] = useState(false);

		// Add state to track initialization status per section
		const [initializedSections, setInitializedSections] = useState({});

		// Check if this is the last section (Disaster Recovery)
		const isLastSection = activeSection === 12;

		// Storage key for localStorage persistence
		const storageKey = `questionnaire-${networkFunction}-${versionNumber.name}`;

		// File size limits
		const maxSingleFileSizeInMB = 30;
		const maxUploadSizeInMB = 300;

		// Calculate total file size
		const totalUploadSizeInBytes = uploadedFiles.reduce((total, file) => total + file.sizeInBytes, 0);
		const totalUploadSizeInMB = (totalUploadSizeInBytes / (1024 * 1024)).toFixed(2);
		const uploadSizePercentage = (totalUploadSizeInMB / maxUploadSizeInMB) * 100;

		useEffect(() => {
			// This effect handles the reset logic separately to avoid the infinite loop
			if (resetRequiredRef.current && resetSectionRef.current !== null && !processedResetRef.current) {
				console.log(`Processing reset for section ${resetSectionRef.current}`);
				processedResetRef.current = true;
				// Now we can update the state safely in a separate effect
				setInitializedSections((prev) => {
					const newState = { ...prev };
					delete newState[resetSectionRef.current];
					return newState;
				});

				setLocalFormData((prev) => {
					const newState = { ...prev };
					delete newState[resetSectionRef.current];
					return newState;
				});

				setSelectedMechanisms((prev) => {
					const newState = { ...prev };
					delete newState[resetSectionRef.current];
					return newState;
				});

				setOtherMechanism((prev) => {
					const newState = { ...prev };
					delete newState[resetSectionRef.current];
					return newState;
				});

				// Clear uploaded files for this section if needed
				setUploadedFiles((prev) => {
					return prev.filter((file) => file.sectionId !== resetSectionRef.current);
				});

				// Reset the refs after a short delay to ensure state updates are processed
				setTimeout(() => {
					resetRequiredRef.current = false;
					resetSectionRef.current = null;
					processedResetRef.current = false;
				}, 50);
			}
		}, []);

		useEffect(() => {
			// Skip validation during initialization
			if (initializing || Object.keys(localFormData).length === 0) return;

			// Debounce the validation to avoid too frequent updates
			const debouncedValidation = debounce(() => {
				// Only proceed if we need to update the invalidSectionsMap
				if (ref.current && ref.current.updateInvalidSections) {
					// Run validation for just the current section
					const sectionValidation = validateSectionRequiredFields(activeSection, schema);

					// Get the full validation state
					const allSectionsValidation = validateAllSections();
					const updatedInvalidSections = {
						...allSectionsValidation.invalidSections,
					};

					// If the section is now valid, remove it from the invalid sections
					if (sectionValidation.isValid) {
						delete updatedInvalidSections[activeSection];
						ref.current.updateInvalidSections(updatedInvalidSections);
					}
					// If invalid but changed, update with new invalid fields
					else if (
						JSON.stringify(updatedInvalidSections[activeSection]) !== JSON.stringify(sectionValidation.invalidFieldIds)
					) {
						updatedInvalidSections[activeSection] = sectionValidation.invalidFieldIds;
						ref.current.updateInvalidSections(updatedInvalidSections);
					}
				}
			}, 500);

			debouncedValidation();

			return () => {
				debouncedValidation.cancel();
			};
		}, [localFormData, selectedMechanisms, otherMechanism, uploadedFiles, activeSection, schema]);

		useEffect(() => {
			if (invalidFields.length > 0) {
				// Scroll to the first invalid field
				const firstInvalidField = document.getElementById(invalidFields[0]);
				if (firstInvalidField) {
					setTimeout(() => {
						firstInvalidField.scrollIntoView({
							behavior: "smooth",
							block: "center",
						});
					}, 100);
				}
			}
		}, [invalidFields]);

		function validateFileUploadField(questionId, sectionId, sectionName, networkFn, versionNum) {
			try {
				console.log(`Validating file upload for questionId: ${questionId}, section: ${sectionName}`);

				// First check if we have files for this question in the component state
				const hasFileInState = uploadedFiles.some(
					(file) => file.questionId === questionId && file.sectionId === parseInt(sectionId, 10),
				);

				if (hasFileInState) {
					console.log(`File validation for ${questionId}: VALID (found in component state)`);
					return true;
				}

				// If not found in component state, check localStorage
				const storageKey = `formData-${networkFn}-${versionNum}`;

				const savedData = localStorage.getItem(storageKey);


				if (!savedData) {
					console.log(`No saved data found in localStorage for ${storageKey}`);
					return false;
				}

				const formData = JSON.parse(savedData);

				// Find the relevant section - normalize section names for comparison
				const section = formData.sections.find(
					(s) => (s.sectionName || s.section_name || "").toLowerCase() === sectionName.toLowerCase(),
				);

				if (!section) {
					console.log(`Section ${sectionName} not found in localStorage`);
					return false;
				}

				// Check if section has files
				if (!section.files || !Array.isArray(section.files) || section.files.length === 0) {
					console.log(`No files found in section ${sectionName} in localStorage`);
					return false;
				}

				// Debug: Print all files in this section
				console.log(
					`Files in localStorage for section ${sectionName}:`,
					section.files.map((f) => `${f.filename} (questionId: ${f.question_id})`),
				);

				// Check if any file matches the questionId
				const hasMatchingFile = section.files.some((file) => file.question_id === questionId);

				console.log(
					`File validation for ${questionId} in ${sectionName}: ${hasMatchingFile ? "VALID (found in localStorage)" : "INVALID (no matching file)"}`,
				);

				return hasMatchingFile;
			} catch (error) {
				console.error("Error validating file upload field:", error);
				return false;
			}
		}

		// Function to initialize uploaded files from localStorage
		function initializeUploadedFilesFromStorage(sectionId, sectionName, networkFn, versionNum) {
			try {
				// Get form data from localStorage
				const storageKey = `formData-${networkFn}-${versionNum}`;
				const savedData = localStorage.getItem(storageKey);

				if (!savedData) {
					console.log(`No saved data found for ${storageKey}`);
					return [];
				}

				const formData = JSON.parse(savedData);

				// Find the section by name - normalize for comparison
				const section = formData.sections.find(
					(s) => (s.sectionName || s.section_name || "").toLowerCase() === sectionName.toLowerCase(),
				);

				if (!section || !section.files || section.files.length === 0) {
					console.log(`No files found in localStorage for section ${sectionName}`);
					return [];
				}

				console.log(`Found ${section.files.length} files in localStorage for section ${sectionName}:`, section.files);

				// Map API file format to the component's file format
				const mappedFiles = section.files.map((file) => {
					// Generate a unique ID for the file
					const fileId = Math.random().toString(36).substr(2, 9);

					// Determine file type based on extension
					const fileExt = file.filename.split(".").pop().toLowerCase();
					const fileType =
						fileExt === "pdf"
							? "application/pdf"
							: fileExt === "docx"
								? "application/msword"
								: fileExt === "xlsx"
									? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
									: "application/octet-stream";

					// Create a reasonable size estimate
					const fileSizeInBytes = 1.2 * 1024 * 1024; // 1.2 MB placeholder

					return {
						id: fileId,
						name: file.filename,
						size: "1.2 MB", // Placeholder size
						sizeInBytes: fileSizeInBytes,
						type: fileType,
						uploadDate: "From Storage",
						checksum: file.checksum || generateChecksum(file.filename, fileExt),
						artifactoryUrl: `https://artifactory.example.com/nokia/docs/${file.filename}`,
						questionId: file.question_id,
						sectionId: parseInt(sectionId, 10),
					};
				});

				console.log(
					`Mapped ${mappedFiles.length} files from localStorage:`,
					mappedFiles.map((f) => `${f.name} (questionId: ${f.questionId})`),
				);

				return mappedFiles;
			} catch (error) {
				console.error("Error initializing files from localStorage:", error);
				return [];
			}
		}

		// Function to initialize uploaded files from localStorage
		function initializeUploadedFilesFromStorage(sectionId, sectionName) {
			try {
				// Get form data from localStorage
				const storageKey = `formData-${networkFunction}-${versionNumber.name}`;
				const savedData = localStorage.getItem(storageKey);

				if (!savedData) {
					console.log(`No saved data found for ${storageKey}`);
					return [];
				}

				const formData = JSON.parse(savedData);

				// Find the section by name
				const section = formData.sections.find((s) => (s.sectionName || s.section_name) === sectionName);

				if (!section || !section.files || section.files.length === 0) {
					console.log(`No files found in localStorage for section ${sectionName}`);
					return [];
				}

				console.log(`Found ${section.files.length} files in localStorage for section ${sectionName}`);

				// Map API file format to the component's file format
				const mappedFiles = section.files.map((file) => {
					// Generate a unique ID for the file
					const fileId = Math.random().toString(36).substr(2, 9);

					// Determine file type based on extension
					const fileExt = file.filename.split(".").pop().toLowerCase();
					const fileType =
						fileExt === "pdf"
							? "application/pdf"
							: fileExt === "docx"
								? "application/msword"
								: fileExt === "xlsx"
									? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
									: "application/octet-stream";

					// Create a reasonable size estimate (or can be placeholder)
					const fileSizeInBytes = 1.2 * 1024 * 1024; // 1.2 MB placeholder

					return {
						id: fileId,
						name: file.filename,
						size: "1.2 MB", // Placeholder size
						sizeInBytes: fileSizeInBytes,
						type: fileType,
						uploadDate: "From Storage",
						checksum: file.checksum || generateChecksum(file.filename, fileExt),
						artifactoryUrl: `https://artifactory.example.com/nokia/docs/${file.filename}`,
						questionId: file.question_id,
						sectionId: parseInt(sectionId, 10),
					};
				});

				return mappedFiles;
			} catch (error) {
				console.error("Error initializing files from localStorage:", error);
				return [];
			}
		}

		// Initialize section data only once when active section changes
		useEffect(() => {
			// Skip if loading or no schema is available yet
			if (initializing || !schema) return;

			//console.log(
			//	`Initializing section ${activeSection} with networkFunction: ${networkFunction}, version: ${versionNumber.name}`,
			//);
			//console.log("Current API section data:", {
			//	hasData: !!apiSectionData,
			//	hasQuestions: apiSectionData && apiSectionData.questions && apiSectionData.questions.length > 0,
			//	sectionName: apiSectionData ? apiSectionData.section_name || apiSectionData.sectionName : "none",
			//	questionCount: apiSectionData && apiSectionData.questions ? apiSectionData.questions.length : 0,
			//});

			// Check if we need to force reset based on the forceReset prop
			const shouldForceReset = forceReset === true;

			// Check if we've already initialized this section
			const isSectionInitialized = initializedSections[activeSection];

			// Debug information
			//console.log("Section initialization state:", {
			//	section: activeSection,
			//	shouldForceReset,
			//	isSectionInitialized,
			//	resetRequired: resetRequiredRef.current,
			//	apiDataAvailable: !!apiSectionData,
			//	hasQuestionsData: apiSectionData && apiSectionData.questions && apiSectionData.questions.length > 0,
			//});

			if (shouldForceReset && !resetRequiredRef.current) {
				console.log(`Forcing reset for section ${activeSection} due to forceReset prop`);
				// Instead of updating state directly, set the ref flags for the other useEffect to handle
				resetRequiredRef.current = true;
				resetSectionRef.current = activeSection;
				return; // Exit early and let the reset useEffect handle the reset
			}

			// Allow reinitialization if API data is present but section not yet initialized with that data
			const shouldInitializeWithApiData =
				apiSectionData &&
				apiSectionData.questions &&
				apiSectionData.questions.length > 0 &&
				(!isSectionInitialized || shouldForceReset);

			// if (isSectionInitialized && !shouldForceReset && !shouldInitializeWithApiData) {
			// 	console.log(`Section ${activeSection} already initialized, skipping initialization`);

			// 	// We should still update visibility since conditional rendering might depend on it
			// 	const initialVisibility = {};
			// 	schema.questions.forEach((question) => {
			// 		initialVisibility[question.id] = !question.hidden;
			// 	});

			// 	// Update visibility for this section
			// 	setVisibleQuestions((prev) => ({
			// 		...prev,
			// 		[activeSection]: {
			// 			...initialVisibility,
			// 			...prev[activeSection],
			// 		},
			// 	}));

			// 	return; // Skip the rest of initialization
			// }
			if (isSectionInitialized && !shouldForceReset && !shouldInitializeWithApiData) {
				console.log(`Section ${activeSection} already initialized, skipping initialization`);
				return; // Skip the rest of initialization 
			}
			const initialFormData = {};
			const initialVisibility = {};

			// Set default values for each question from schema
			schema.questions.forEach((question) => {
				initialFormData[question.id] = question.defaultValue || "";
				initialVisibility[question.id] = !question.hidden;
			});

			// Check if API data is available to override defaults
			if (apiSectionData && apiSectionData.questions && apiSectionData.questions.length > 0) {
				console.log(`Pre-filling form with API data for section: ${activeSection}`);
				console.log(`Found ${apiSectionData.questions.length} questions in API data`);

				// Create a map of question IDs for faster lookup
				const questionMap = {};
				apiSectionData.questions.forEach((q) => {
					questionMap[q.questionId] = q.answer;
				});

				// Override default values with API data where available
				Object.keys(initialFormData).forEach((questionId) => {
					if (questionMap[questionId] !== undefined) {
						console.log(`Setting ${questionId} to ${questionMap[questionId]}`);
						initialFormData[questionId] = questionMap[questionId];
					}
				});

				// Log any API questions that were not found in the schema
				apiSectionData.questions.forEach((apiQuestion) => {
					if (!initialFormData.hasOwnProperty(apiQuestion.questionId)) {
						console.log(`Question ID ${apiQuestion.questionId} from API not found in form schema`);
					}
				});

				// Handle special cases like mechanisms (checkboxes)
				const allMechanismQuestions = apiSectionData.questions.filter((q) => q.questionId === "validationMechanisms");
				let mechanismsQuestion = null;

				// Find the first non-empty answer (handles possible duplicates in the API response)
				for (const q of allMechanismQuestions) {
					if (q.answer) {
						mechanismsQuestion = q;
						break;
					}
				}

				// If a question with a non-empty answer was found, parse it
				if (mechanismsQuestion && mechanismsQuestion.answer) {
					try {
						console.log(`Found validationMechanisms with answer: ${mechanismsQuestion.answer}`);

						// Parse the JSON string to get the array
						let mechanisms = mechanismsQuestion.answer;
						// Update the state with the parsed array
						setSelectedMechanisms((prev) => ({
							...prev,
							[activeSection]: mechanisms,
						}));
					} catch (error) {
						console.error("Error parsing mechanisms from API:", error);
						console.error("Original answer:", mechanismsQuestion.answer);
						setSelectedMechanisms((prev) => ({ ...prev, [activeSection]: [] }));
					}
				} else {
					console.log(`No non-empty validationMechanisms found for section ${activeSection}`);
					setSelectedMechanisms((prev) => ({ ...prev, [activeSection]: [] }));
				}

				// Handle other mechanism text
				const otherMechanismQuestion = apiSectionData.questions.find((q) => q.questionId === "otherMechanism");
				if (otherMechanismQuestion && otherMechanismQuestion.answer) {
					console.log(`Setting otherMechanism: ${otherMechanismQuestion.answer}`);
					setOtherMechanism((prev) => ({
						...prev,
						[activeSection]: otherMechanismQuestion.answer,
					}));
				}

				// Handle uploaded files if present in API data
				if (apiSectionData.files && apiSectionData.files.length > 0) {
					console.log(`Found ${apiSectionData.files.length} files in API data`);

					// Map API file format to the component's file format
					const mappedFiles = apiSectionData.files.map((file) => {
						// Generate a unique ID for the file
						const fileId = Math.random().toString(36).substr(2, 9);
						// Determine file type based on extension
						const fileExt = file.filename.split(".").pop().toLowerCase();
						const fileType =
							fileExt === "pdf"
								? "application/pdf"
								: fileExt === "docx"
									? "application/msword"
									: fileExt === "xlsx"
										? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
										: "application/octet-stream";

						// Create a reasonable upload date (use current time since API data might not include it)
						const readableDate = "From API";

						// Create a checksum for the file
						const checksum = file.checksum || generateChecksum(file.filename, fileExt);

						// Find a question that accepts file uploads - IMPROVED LOGIC
						let questionId = file.question_id;

						// If no question ID is provided or it's defaultFileQuestion, try to assign intelligently
						if (!questionId || questionId === "defaultFileQuestion") {
							// For the install section, assign files to uploadStepsDoc
							if (activeSection === 2) {
								questionId = "uploadStepsDoc";
								console.log(`Assigning file ${file.filename} to uploadStepsDoc for install section`);
							}
							// For other sections, find file questions in the schema
							else {
								const fileQuestions = schema.questions.filter((q) => q.type === "file");

								if (fileQuestions.length > 0) {
									// Use the first file question if there's only one
									if (fileQuestions.length === 1) {
										questionId = fileQuestions[0].id;
									}
									// Try to determine by filename patterns
									else {
										const filenameLower = file.filename.toLowerCase();

										if (filenameLower.includes("mop")) {
											questionId = "uploadMOPs";
										} else if (filenameLower.includes("automation")) {
											questionId = "uploadAutomationDocs";
										} else {
											// Default to first question
											questionId = fileQuestions[0].id;
										}
									}
									console.log(`Assigned file ${file.filename} to question ${questionId}`);
								} else {
									questionId = "defaultFileQuestion";
								}
							}
						}

						return {
							id: fileId,
							name: file.filename,
							size: "1.2 MB", // This is placeholder, ideally would come from API
							sizeInBytes: 1.2 * 1024 * 1024, // Placeholder
							type: fileType,
							uploadDate: readableDate,
							checksum: checksum,
							artifactoryUrl: `https://artifactory.example.com/nokia/docs/${file.filename}`,
							questionId: questionId,
							sectionId: activeSection,
						};
					});

					console.log("Adding files from API data:", mappedFiles);
					// Update to store API files
					setUploadedFiles((prev) => {
						const filteredFiles = prev.filter((file) => file.sectionId !== activeSection);
						return [...filteredFiles, ...mappedFiles];
					});
				}

				// ALWAYS check localStorage for additional files regardless of API data
				const storageFiles = initializeUploadedFilesFromStorage(
					activeSection,
					schema.sectionName,
					networkFunction,
					versionNumber,
				);

				if (storageFiles.length > 0) {
					console.log(`Found ${storageFiles.length} files in localStorage for section ${activeSection}`);

					// Merge files from localStorage with existing files, avoiding duplicates
					setUploadedFiles((prev) => {
						// Keep files for other sections
						const otherSectionFiles = prev.filter((file) => file.sectionId !== activeSection);

						// Get files already loaded for this section
						const currentSectionFiles = prev.filter((file) => file.sectionId === activeSection);

						// Create a set of filenames already loaded
						const existingFilenames = new Set(currentSectionFiles.map((file) => file.name));

						// Only add files from localStorage that aren't already loaded
						const newFiles = storageFiles.filter((file) => !existingFilenames.has(file.name));

						console.log(`Adding ${newFiles.length} unique files from localStorage`);

						// Combine all files
						return [...otherSectionFiles, ...currentSectionFiles, ...newFiles];
					});
				}
			} else {
				console.log(`No API data available for section ${activeSection}, using default values`);

				// Check localStorage for files
				const filesFromStorage = initializeUploadedFilesFromStorage(
					activeSection,
					schema.sectionName,
					networkFunction,
					versionNumber,
				);

				if (filesFromStorage.length > 0) {
					console.log(`Found ${filesFromStorage.length} files in localStorage for section ${activeSection}`);

					// Update uploadedFiles state with files from localStorage
					setUploadedFiles((prev) => {
						// First filter out any existing files for this section
						const filteredFiles = prev.filter((file) => file.sectionId !== activeSection);
						// Then add the new files
						return [...filteredFiles, ...filesFromStorage];
					});
				}
			}

			// Always update the form data with the new values, overriding any existing data for this section
			setLocalFormData((prev) => ({
				...prev,
				[activeSection]: initialFormData,
			}));
			setVisibleQuestions((prev) => ({
				...prev,
				[activeSection]: initialVisibility,
			}));

			// Mark this section as initialized - but don't do this during a reset
			if (!isSectionInitialized && !shouldForceReset) {
				// Use setTimeout to avoid state updates in the same render cycle
				setTimeout(() => {
					setInitializedSections((prev) => ({
						...prev,
						[activeSection]: true,
					}));
					console.log(`Section ${activeSection} marked as initialized`);
				}, 0);
			}
		}, [activeSection, schema, apiSectionData, initializing, networkFunction, versionNumber, forceReset]);

		// This useEffect specifically handles changes to forceReset in the parent
		useEffect(() => {
			if (forceReset) {
				console.log("forceReset prop is true - component will reset on next render");
			}
		}, [forceReset]);
		// Get current section data - extract values once to avoid repeated object access
		const currentFormData = localFormData[activeSection] || {};
		const currentVisibleQuestions = visibleQuestions[activeSection] || {};
		const currentMechanisms = selectedMechanisms[activeSection] || [];
		const currentOtherMechanism = otherMechanism[activeSection] || "";

		// Load data from localStorage on mount
		useEffect(() => {
			if (initializing) return;

			try {
				const savedData = localStorage.getItem(storageKey);
				if (savedData) {
					const parsedData = JSON.parse(savedData);
					console.log("Found saved form data in localStorage:", parsedData);

					// Only restore data for sections that haven't been initialized from API
					if (parsedData.localFormData) {
						// Use the parsed data to update state
						setLocalFormData((prev) => ({
							...prev,
							...parsedData.localFormData,
						}));
					}

					if (parsedData.selectedMechanisms) {
						setSelectedMechanisms((prev) => ({
							...prev,
							...parsedData.selectedMechanisms,
						}));
					}

					if (parsedData.otherMechanism) {
						setOtherMechanism((prev) => ({
							...prev,
							...parsedData.otherMechanism,
						}));
					}

					// Mark all sections in localStorage as initialized
					if (parsedData.localFormData) {
						const sectionsInStorage = Object.keys(parsedData.localFormData);
						const newInitializedSections = {};

						sectionsInStorage.forEach((sectionId) => {
							newInitializedSections[sectionId] = true;
						});

						setInitializedSections((prev) => ({
							...prev,
							...newInitializedSections,
						}));
					}
				}
			} catch (error) {
				console.error("Error loading from localStorage:", error);
			}
		}, [storageKey, initializing]);

		// Save data to localStorage when it changes
		useEffect(() => {
			if (initializing) return;

			const saveToLocalStorage = () => {
				try {
					const dataToSave = {
						localFormData,
						selectedMechanisms,
						otherMechanism,
					};

					localStorage.setItem(storageKey, JSON.stringify(dataToSave));
					console.log("Saved form data to localStorage");
				} catch (error) {
					console.error("Error saving to localStorage:", error);
				}
			};

			// Debounce to avoid excessive storage operations
			const debouncedSave = debounce(saveToLocalStorage, 1000);
			debouncedSave();

			return () => {
				debouncedSave.cancel();
			};
		}, [localFormData, selectedMechanisms, otherMechanism, storageKey, initializing]);

		useEffect(() => {
			// Skip if no form data available yet
			if (Object.keys(currentFormData).length === 0) return;

			// Prevent running again if we're already in an update cycle
			if (visibilityUpdateInProgressRef.current) return;
			visibilityUpdateInProgressRef.current = true;

			// Calculate new visibility state without updating state yet
			const currentSectionVisibility = visibleQuestions[activeSection] || {};
			const newVisibility = { ...currentSectionVisibility };
			let changed = false;

			// Process conditional visibility
			schema.questions.forEach((question) => {
				if (!question.conditionalQuestions) return;

				if (question.type === "radio") {
					const selectedOption = currentFormData[question.id];

					// Get all conditional question IDs for this question
					const allConditionalIds = Object.values(question.conditionalQuestions).flat();

					// Hide all dependent questions first
					allConditionalIds.forEach((dependentId) => {
						if (newVisibility[dependentId] !== false) {
							newVisibility[dependentId] = false;
							changed = true;
						}
					});

					// Show only questions for the selected option
					if (selectedOption && question.conditionalQuestions[selectedOption]) {
						question.conditionalQuestions[selectedOption].forEach((dependentId) => {
							if (newVisibility[dependentId] !== true) {
								newVisibility[dependentId] = true;
								changed = true;
							}
						});
					}
				}

				// Handle checkbox "other" option
				if (
					question.type === "checkbox" &&
					question.conditionalQuestions.other &&
					currentMechanisms.includes("other")
				) {
					question.conditionalQuestions.other.forEach((dependentId) => {
						if (newVisibility[dependentId] !== true) {
							newVisibility[dependentId] = true;
							changed = true;
						}
					});
				}
			});

			// Only update state if there's a change
			if (changed) {
				// Use setTimeout to break the synchronous update cycle
				setTimeout(() => {
					setVisibleQuestions((prev) => ({
						...prev,
						[activeSection]: newVisibility,
					}));
					// Reset the update flag after the state update is processed
					visibilityUpdateInProgressRef.current = false;
				}, 0);
			} else {
				// Reset the flag if no change was needed
				visibilityUpdateInProgressRef.current = false;
			}
		}, [activeSection, schema, currentFormData, currentMechanisms]);

		// Update the responses data in the ref whenever relevant values change
		useEffect(() => {
			if (Object.keys(currentFormData).length === 0) return;

			// Create questions array from form data, filtering out special fields that we'll handle separately
			const questions = Object.entries(currentFormData)
				.filter(([id]) => id !== "validationMechanisms" && id !== "otherMechanism")
				.map(([id, answer]) => {
					const question = schema.questions.find((q) => q.id === id);
					return {
						questionId: id,
						questionText: question?.text || "Unknown Question",
						answer: answer,
					};
				});

			// Add mechanisms if any
			if (currentMechanisms.length > 0) {
				console.log("Adding mechanisms:", currentMechanisms);
				questions.push({
					questionId: "validationMechanisms",
					questionText: schema.questions.find((q) => q.id === "validationMechanisms")?.text || "",
					answer: currentMechanisms,
				});
			}

			// Add other mechanism if any
			if (currentOtherMechanism) {
				console.log("Adding otherMechanism:", currentOtherMechanism);
				questions.push({
					questionId: "otherMechanism",
					questionText: schema.questions.find((q) => q.id === "otherMechanism")?.text || "",
					answer: currentOtherMechanism,
				});
			}

			// Still track uploaded files in the ref (for UI purposes)
			const sectionFiles = uploadedFiles
				.filter((file) => file.sectionId === activeSection)
				.map((file) => ({
					filename: file.name,
					uploadedAt: { $date: new Date().toISOString() },
				}));

			// Store in the ref (this doesn't trigger re-renders)
			sectionDataRef.current[activeSection] = {
				sectionName: schema.sectionName,
				questions,
				// Removed uploadedFiles from the ref data structure, but files are still tracked elsewhere
			};
		}, [activeSection, schema, currentFormData, currentMechanisms, currentOtherMechanism, uploadedFiles]);

		// Add useEffect to validate sections whenever form data changes
		useEffect(() => {
			// Skip validation during initialization
			if (initializing || Object.keys(localFormData).length === 0) return;

			// Debounce the validation to avoid too frequent updates
			const debouncedValidation = debounce(() => {
				validateAndUpdateInvalidSections();
			}, 500);

			debouncedValidation();

			return () => {
				debouncedValidation.cancel();
			};
		}, [localFormData, selectedMechanisms, otherMechanism, uploadedFiles]);

		// Print JSON payload to console and save to API
		const saveData = async () => {
			// Set saving state
			setIsSaving(true);

			try {
				// Collect all sections data
				const allSections = Object.values(sectionDataRef.current)
					.filter((section) => section.questions && section.questions.length > 0)
					.map((section) => ({
						sectionName: section.sectionName,
						questions: section.questions.map(
							(q) => (
								// console.log(q.answer),
								// console.log(typeof q.answer),
								{
									questionId: q.questionId,
									questionText: q.questionText,
									answer: q.answer,
								}
							),
						),
					}));

				// Format the complete questionnaire data to match API response format
				const completeData = {
					nfName: networkFunction,
					version: versionNumber,
					sections: allSections,
					status: "In Progress",
				};

				// Log to console for debugging
				// console.log("%c Complete Questionnaire JSON Payload:", "color: green; font-weight: bold; font-size: 14px;");
				// console.log(JSON.stringify(completeData, null, 2));
				// console.log(completeData)

				// Save to API
				const result = await saveQuestionnaireToAPI(completeData);

				if (result.success) {
					// Show success message
					setToastMessage({
						type: "success",
						text: `Form data for ${schema.sectionTitle} saved successfully!`,
						visible: true,
					});
				} else {
					// Show error message
					setToastMessage({
						type: "error",
						text: `Error saving data: ${result.error}`,
						visible: true,
					});
				}

				setIsSaving(false);
				return completeData;
			} catch (error) {
				console.error("Error preparing questionnaire data:", error);

				// Show error message
				setToastMessage({
					type: "error",
					text: `Error preparing data: ${error.message}`,
					visible: true,
				});

				setIsSaving(false);
				return null;
			}
		};

		// validateSectionRequiredFields function with improved validation for all sections
		const validateSectionRequiredFields = (sectionId, sectionSchema) => {
			// Validation result tracking
			let isValid = true;
			const invalidFieldIds = [];

			// Early return if schema is missing
			if (!sectionSchema || !sectionSchema.questions) {
				console.error(`Cannot validate section ${sectionId} - schema missing or invalid`);
				return { isValid: false, invalidFieldIds: [] };
			}

			// Retrieve data from localStorage first
			const storageKey = `formData-${networkFunction}-${versionNumber}`;

			let storedFormData = null;
			try {
				const storedData = localStorage.getItem(storageKey);

				if (storedData) {
					storedFormData = JSON.parse(storedData);
					// console.log("Retrieved data from localStorage:", storedFormData);
				}
			} catch (error) {
				console.error("Error parsing localStorage data:", error);
			}

			// Determine form data source
			const formDataSource = storedFormData
				? storedFormData.sections.find(
					(section) => section.sectionName.toLowerCase() === (sectionSchema.sectionName || "").toLowerCase(),
				)
				: null;

			// Prepare form data
			const formData = {};
			const fileQuestions = [];

			// If source data exists, process its questions
			if (formDataSource && formDataSource.questions) {
				formDataSource.questions.forEach((q) => {
					formData[q.questionId] = q.answer;

					// Track file upload questions
					if (q.questionId.includes("upload")) {
						fileQuestions.push(q.questionId);
					}
				});
			}

			// Fallback to local form data if no localStorage data
			const localSectionData = localFormData[sectionId] || {};
			Object.keys(localSectionData).forEach((key) => {
				if (!formData[key]) {
					formData[key] = localSectionData[key];
				}
			});


			// Get current form data directly from the state - this is more reliable for current values
			const currentFormData = localFormData[sectionId] || {};

			// Calculate visibility dynamically
			const calculateVisibility = () => {
				const visibility = {};

				// Start with default visibility from schema
				sectionSchema.questions.forEach((question) => {
					// Default to visible if not explicitly hidden
					visibility[question.id] = !question.hidden;
				});

				// Process conditional visibility
				sectionSchema.questions.forEach((question) => {
					if (!question.conditionalQuestions) return;

					if (question.type === "radio") {
						const selectedOption = formData[question.id];

						// Reset dependent questions to hidden
						Object.values(question.conditionalQuestions)
							.flat()
							.forEach((dependentId) => {
								visibility[dependentId] = false;
							});

						// Show questions for the selected option
						if (selectedOption && question.conditionalQuestions[selectedOption]) {
							question.conditionalQuestions[selectedOption].forEach((dependentId) => {
								visibility[dependentId] = true;
							});
						}
					}
				});

				return visibility;
			};

			// Calculate visibility dynamically
			const visibleQuestions = calculateVisibility();

			// Retrieve mechanisms and other data from multiple sources
			const mechanisms = selectedMechanisms[sectionId] || formData["validationMechanisms"] || [];

			const otherMech = otherMechanism[sectionId] || formData["otherMechanism"] || "";

			// Detailed logging
			// console.group(`🔍 Validating Section ${sectionId}`);
			// console.log("Form Data:", JSON.stringify(formData, null, 2));
			// console.log("Current Form Data:", JSON.stringify(currentFormData, null, 2));
			// console.log("Visible Questions:", visibleQuestions);
			// console.log("Mechanisms:", mechanisms);
			// console.log("Other Mechanism:", otherMech);

			// Process each question in the schema
			sectionSchema.questions.forEach((question) => {
				// Skip hidden questions
				if (!visibleQuestions[question.id]) {
					// console.log(`Skipping hidden question: ${question.id}`);
					return;
				}

				// Only validate required questions
				if (question.required) {
					// Prioritize current form data over stored data for validation
					// This ensures we're checking the most up-to-date values
					let fieldValue =
						currentFormData[question.id] !== undefined ? currentFormData[question.id] : formData[question.id];

					let isFieldValid = true;

					// console.group(`Validating Question: ${question.id}`);
					// console.log("Question Type:", question.type);
					// console.log("Current Value:", fieldValue);

					// Validation logic based on question type
					switch (question.type) {
						case "radio":
							isFieldValid = fieldValue !== undefined && fieldValue !== null && fieldValue !== "";
							break;

						case "checkbox":
							if (question.id === "validationMechanisms") {
								// Validate mechanism selection
								isFieldValid = mechanisms.length > 0;
							} else {
								// Generic checkbox must be true
								isFieldValid = fieldValue === true;
							}
							break;

						case "text":
						case "number":
						case "textarea":
							// Ensure stringified value is not empty (handle different types)
							isFieldValid = fieldValue !== undefined && fieldValue !== null && String(fieldValue).trim() !== "";
							// console.log(`Text field value: "${fieldValue}", isValid: ${isFieldValid}`);
							break;

						case "file":
							// Check if this is a file upload question
							const isFileUploadQuestion = question.id.includes("upload");

							if (isFileUploadQuestion && question.required) {
								// Use the validateFileUploadField function properly with all parameters
								isFieldValid = validateFileUploadField(
									question.id,
									sectionId,
									sectionSchema.sectionName,
									networkFunction,
									versionNumber,
								);

								// console.log(`File validation result for ${question.id}: ${isFieldValid ? "VALID" : "INVALID"}`);
							}
							break;

						default:
							// Fallback validation for unknown types
							isFieldValid = fieldValue !== undefined && fieldValue !== null && String(fieldValue).trim() !== "";
					}

					// Special handling for "other" mechanism
					if (question.id === "otherMechanism") {
						if (mechanisms.includes("other")) {
							// If 'other' is selected, require text input
							isFieldValid = otherMech && otherMech.trim() !== "";
						} else {
							// If 'other' not selected, this field is valid regardless
							isFieldValid = true;
						}
					}

					// Log validation result
					// console.log("Is Field Valid:", isFieldValid);

					// Track invalid fields
					if (!isFieldValid) {
						isValid = false;
						invalidFieldIds.push(question.id);
						// console.warn(`❌ Field ${question.id} is INVALID`);
					}

					console.groupEnd();
				}
			});

			// Final validation summary
			// console.log("Overall Section Validation:", {
			// 	sectionId,
			// 	isValid,
			// 	invalidFields: invalidFieldIds,
			// });
			console.groupEnd();

			return {
				isValid,
				invalidFieldIds,
			};
		};

		// Validate all required fields
		const validateRequiredFields = () => {
			// Validate all visible questions in the current section
			const validation = validateSectionRequiredFields(activeSection, schema);

			return validation;
		};

		const validateAllSections = () => {
			const allSectionsValidation = {};
			let isValid = true;

			// Get all section schemas
			Object.keys(questionnaireSchemas).forEach((sectionId) => {
				const sectionSchema = questionnaireSchemas[sectionId];
				const numericSectionId = parseInt(sectionId, 10);

				// Validate each section
				const sectionValidation = validateSectionRequiredFields(numericSectionId, sectionSchema);
				
				// If this section has invalid fields, add it to the result
				if (!sectionValidation.isValid) {
					allSectionsValidation[numericSectionId] = sectionValidation.invalidFieldIds;
					isValid = false;
				}
			});

			return {
				isValid,
				invalidSections: allSectionsValidation,
			};
		};

		const validateAndUpdateInvalidSections = () => {
			const allSectionsValidation = validateAllSections();

			console.log("! Invalid sections detected:", allSectionsValidation.invalidSections);
			console.log("! Can update parent?", !!ref.current?.updateInvalidSections);

			// Notify parent component about invalid sections
			if (ref.current && ref.current.updateInvalidSections) {
				console.log("! Calling parent updateInvalidSections with:", allSectionsValidation.invalidSections);
				ref.current.updateInvalidSections(allSectionsValidation.invalidSections);
			} else {
				console.warn("! Cannot update parent - ref.current.updateInvalidSections is not available");
			}

			return allSectionsValidation.isValid;
		};

		// Submit questionnaire (final submission)
		const submitQuestionnaire = async () => {
			// Always set hasAttemptedSubmit to true to ensure validation is displayed
			setHasAttemptedSubmit(true);

			// Perform a comprehensive validation of all sections
			const allSectionsValidation = validateAllSections();

			// Force a re-validation to ensure we catch any recently cleared fields
			const forceRevalidate = () => {
				// Re-check each section using schemas
				Object.keys(questionnaireSchemas).forEach((sectionId) => {
					const sectionSchema = questionnaireSchemas[sectionId];
					const numSectionId = parseInt(sectionId, 10);
					validateSectionRequiredFields(numSectionId, sectionSchema);
				});

				// Return a fresh validation result
				return validateAllSections();
			};

			// Get the most up-to-date validation state
			const finalValidation = forceRevalidate();

			if (!finalValidation.isValid) {
				// Count total missing fields
				const totalMissingFields = Object.values(finalValidation.invalidSections).reduce(
					(total, fields) => total + fields.length,
					0,
				);

				console.log("Validation failed before submission:", finalValidation.invalidSections);
				console.log(`Total missing fields: ${totalMissingFields}`);

				// Show error message
				setToastMessage({
					type: "error",
					text: `Please fill in all required fields (${totalMissingFields} missing across ${Object.keys(finalValidation.invalidSections).length} sections)`,
					visible: true,
				});

				// Set invalid fields for the current section
				if (finalValidation.invalidSections[activeSection]) {
					setInvalidFields(finalValidation.invalidSections[activeSection]);

					// Scroll to the first invalid field in current section if it exists
					if (finalValidation.invalidSections[activeSection].length > 0) {
						setTimeout(() => {
							const firstInvalidField = document.getElementById(finalValidation.invalidSections[activeSection][0]);
							if (firstInvalidField) {
								firstInvalidField.scrollIntoView({
									behavior: "smooth",
									block: "center",
								});
							}
						}, 100);
					}
				}

				// Update parent component with invalid sections
				if (ref.current && ref.current.updateInvalidSections) {
					ref.current.updateInvalidSections(finalValidation.invalidSections);
				}

				// Find the first section with errors and navigate to it if not on that section
				const firstInvalidSection = Object.keys(finalValidation.invalidSections)
					.map((sectionId) => parseInt(sectionId, 10))
					.sort((a, b) => a - b)[0];

				if (firstInvalidSection !== undefined && firstInvalidSection !== activeSection) {
					// If we're not already on the first invalid section, navigate to it
					if (ref.current && ref.current.navigateToSection) {
						ref.current.navigateToSection(firstInvalidSection);
					}
				}

				return null;
			}

			// If validation passes, clear any previous validation errors
			setInvalidFields([]);

			// Clear invalid sections in parent component
			if (ref.current && ref.current.updateInvalidSections) {
				ref.current.updateInvalidSections({});
			}

			// Set submitting state
			setIsSubmitting(true);

			try {
				// Collect all sections data
				const allSections = Object.values(sectionDataRef.current)
					.filter((section) => section.questions && section.questions.length > 0)
					.map((section) => ({
						sectionName: section.sectionName,
						questions: section.questions.map((q) => ({
							questionId: q.questionId,
							questionText: q.questionText,
							answer: q.answer,
						})),
					}));

				// Format the complete questionnaire data
				const completeData = {
					nfName: networkFunction,
					version: versionNumber,
					sections: allSections,
					status: "Submitted", // Mark this as a final submission, not a draft
					latest: true,
				};

				// Save to API
				const result = await saveQuestionnaireToAPI(completeData);

				if (result.success) {
					// Show success message
					setToastMessage({
						type: "success",
						text: `Form submitted successfully! Thank you for completing the questionnaire.`,
						visible: true,
					});

					// Clear localStorage data for this questionnaire
					try {
						// Remove only this specific questionnaire's data
						localStorage.removeItem(storageKey);

						// Additionally, search for and remove any related keys
						Object.keys(localStorage).forEach((key) => {
							if (key.includes(`formData-${networkFunction}`) || key.includes(`questionnaire-${networkFunction}`)) {
								localStorage.removeItem(key);
							}
						});

						console.log("Cleared localStorage data after submission");
					} catch (error) {
						console.error("Error clearing localStorage:", error);
					}

					// Set a delay to show the success message before reloading
					setTimeout(() => {
						// Show a final message before reloading
						setToastMessage({
							type: "info",
							text: "Reloading the application...",
							visible: true,
						});
						setHasAttemptedSubmit(false);
						// Use a short delay to ensure the message is seen
						setTimeout(() => {
							// Reload the page to start fresh
							window.location.reload();
						}, 1000);
					}, 2000);
				} else {
					// Show error message
					setToastMessage({
						type: "error",
						text: `Error submitting form: ${result.error}`,
						visible: true,
					});
					setIsSubmitting(false);
				}
				return completeData;
			} catch (error) {
				console.error("Error preparing questionnaire data:", error);

				// Show error message
				setToastMessage({
					type: "error",
					text: `Error preparing data for submission: ${error.message}`,
					visible: true,
				});

				setIsSubmitting(false);
				return null;
			}
		};

		// Generate MD5 checksum (simplified simulation for UI purposes)
		const generateChecksum = (fileName, fileSize) => {
			// In a real app, we would calculate an actual checksum from the file content
			// This is a simplified version that generates a deterministic hash-like string
			const baseString = fileName + fileSize;
			let hash = 0;
			for (let i = 0; i < baseString.length; i++) {
				const char = baseString.charCodeAt(i);
				hash = (hash << 5) - hash + char;
				hash = hash & hash; // Convert to 32bit integer
			}
			// Convert to md5-like hex string
			const hexHash = Math.abs(hash).toString(16).padStart(32, "0");
			return hexHash;
		};

		// Handle input changes
		// Enhanced handleInputChange function with improved validation
		const handleInputChange = useCallback(
			(questionId, value) => {
				// Get the question schema to check if it's required
				const questionSchema = schema.questions.find((q) => q.id === questionId);
				const isRequired = questionSchema ? questionSchema.required : false;

				// Check if the new value would be invalid for a required field
				const isEmpty =
					value === undefined ||
					value === null ||
					(typeof value === "string" && value.trim() === "") ||
					(Array.isArray(value) && value.length === 0);

				const wouldBeInvalid = isRequired && isEmpty;

				// Clear validation error for this field if it exists and the new value is valid
				if (invalidFields.includes(questionId) && !wouldBeInvalid) {
					setInvalidFields((prev) => prev.filter((id) => id !== questionId));

					// If this was the last invalid field in this section, update the parent
					if (invalidFields.length === 1 && invalidFields[0] === questionId) {
						// This check prevents unnecessary updates
						if (ref.current && ref.current.updateInvalidSections) {
							const allSectionsValidation = validateAllSections();
							const updatedInvalidSections = {
								...allSectionsValidation.invalidSections,
							};

							// If validation passes for this section after this change, remove it
							if (
								!updatedInvalidSections[activeSection] ||
								updatedInvalidSections[activeSection].length === 0 ||
								(updatedInvalidSections[activeSection].length === 1 &&
									updatedInvalidSections[activeSection][0] === questionId)
							) {
								delete updatedInvalidSections[activeSection];
								ref.current.updateInvalidSections(updatedInvalidSections);
							}
						}
					}
				}
				// Add validation error if the field is becoming invalid
				else if (!invalidFields.includes(questionId) && wouldBeInvalid && hasAttemptedSubmit) {
					console.log(`Field ${questionId} is now invalid with value:`, value);
					setInvalidFields((prev) => [...prev, questionId]);

					// Update parent component with invalid section
					if (ref.current && ref.current.updateInvalidSections) {
						const allSectionsValidation = validateAllSections();
						const updatedInvalidSections = {
							...allSectionsValidation.invalidSections,
						};

						// Ensure this section is included in invalid sections
						if (!updatedInvalidSections[activeSection]) {
							updatedInvalidSections[activeSection] = [questionId];
						} else if (!updatedInvalidSections[activeSection].includes(questionId)) {
							updatedInvalidSections[activeSection] = [...updatedInvalidSections[activeSection], questionId];
						}

						ref.current.updateInvalidSections(updatedInvalidSections);
					}
				}

				// Log the value change for debugging
				console.log(
					`Updating ${questionId} from ${JSON.stringify(currentFormData[questionId])} to ${JSON.stringify(value)}`,
				);

				// Update the form data with the new value
				setLocalFormData((prev) => ({
					...prev,
					[activeSection]: {
						...prev[activeSection],
						[questionId]: value,
					},
				}));
			},
			[activeSection, invalidFields, hasAttemptedSubmit, validateAllSections, schema.questions, currentFormData],
		);

		// Handle file upload
		const handleFileUpload = async (e, questionId) => {
			const files = Array.from(e.target.files);

			// Reset the file input value to allow re-uploading the same file again
			e.target.value = "";

			// Clear validation error if it exists
			if (invalidFields.includes(questionId)) {
				setInvalidFields((prev) => prev.filter((id) => id !== questionId));
			}
			const questionFiles = getQuestionFiles(questionId);

			// Get the question schema to access maxFiles
			const questionSchema = schema.questions.find((q) => q.id === questionId);
			if (!questionSchema) {
				console.error(`Question schema not found for ID: ${questionId}`);
				return;
			}

			// Debug information
			console.log("File upload validation:", {
				questionId,
				maxFiles: questionSchema.maxFiles,
				currentQuestionFiles: questionFiles.length,
				newFiles: files.length,
				wouldExceed: questionFiles.length + files.length > questionSchema.maxFiles,
			});

			// CRITICAL FIX: Validate file count PER QUESTION instead of globally
			if (questionFiles.length + files.length > questionSchema.maxFiles) {
				setToastMessage({
					type: "error",
					text: `You can only upload a maximum of ${questionSchema.maxFiles} files for this question. Currently: ${questionFiles.length}, Attempting to add: ${files.length}`,
					visible: true,
				});
				return;
			}

			// Check individual file size limits
			const oversizedFiles = files.filter((file) => file.size > maxSingleFileSizeInMB * 1024 * 1024);
			if (oversizedFiles.length > 0) {
				const fileNames = oversizedFiles.map((f) => f.name).join(", ");
				setToastMessage({
					type: "error",
					text: `The following files exceed the ${maxSingleFileSizeInMB} MB limit per file: ${fileNames}`,
					visible: true,
				});
				return;
			}

			// Calculate the size of the new files
			const newFilesTotalSizeInBytes = files.reduce((total, file) => total + file.size, 0);
			const newTotalSizeInBytes = totalUploadSizeInBytes + newFilesTotalSizeInBytes;
			const newTotalSizeInMB = newTotalSizeInBytes / (1024 * 1024);

			if (newTotalSizeInMB > maxUploadSizeInMB) {
				setToastMessage({
					type: "error",
					text: `Total upload size cannot exceed ${maxUploadSizeInMB} MB. Current: ${totalUploadSizeInMB} MB, Attempting to add: ${(newFilesTotalSizeInBytes / (1024 * 1024)).toFixed(2)} MB`,
					visible: true,
				});
				return;
			}

			// Begin the upload process
			try {
				// Set uploading state
				setUploading(true);

				// Initialize progress tracking for each file
				const initialProgress = {};
				files.forEach((file) => {
					initialProgress[file.name] = 0;
				});
				setUploadProgress(initialProgress);

				// Show loading toast
				setToastMessage({
					type: "info",
					text: `Uploading ${files.length} ${files.length === 1 ? "file" : "files"}...`,
					visible: true,
				});

				// Arrays to track upload results
				const uploadedFilesData = [];
				const failedUploads = [];

				// Set a timeout to handle hanging uploads
				const uploadTimeout = setTimeout(() => {
					if (uploading) {
						setToastMessage({
							type: "error",
							text: "Upload is taking longer than expected. Please check your connection and try again.",
							visible: true,
						});
						setUploading(false);
					}
				}, 30000); // 30 second timeout

				// Process each file
				for (const file of files) {
					try {
						// Update progress to show upload started
						setUploadProgress((prev) => ({
							...prev,
							[file.name]: 5, // Start with 5% to show activity
						}));

						// Get section name from schema
						const sectionName = schema.sectionName;

						// Simulate progress updates
						const progressInterval = setInterval(() => {
							setUploadProgress((prev) => {
								const currentProgress = prev[file.name] || 0;
								if (currentProgress < 90) {
									return {
										...prev,
										[file.name]: currentProgress + 5,
									};
								}
								return prev;
							});
						}, 300);

						// Use the uploadFile API function from api-service
						const result = await uploadFile(file, networkFunction, versionNumber, sectionName, questionId);

						// Clear the progress interval
						clearInterval(progressInterval);

						// Set progress to 100% when done
						setUploadProgress((prev) => ({
							...prev,
							[file.name]: 100,
						}));

						// Check if the upload was successful
						if (result.success) {
							// Get file size in MB
							const fileSizeInMB = (file.size / (1024 * 1024)).toFixed(2);

							// Generate a checksum
							const checksum = generateChecksum(file.name, file.size);

							// Create a file object using data from the API response
							const fileObj = {
								id: Math.random().toString(36).substr(2, 9),
								name: result.data.filename || file.name,
								size: fileSizeInMB + " MB",
								sizeInBytes: file.size,
								type: file.type,
								uploadDate: "Just now",
								checksum: checksum,
								artifactoryUrl: `https://artifactory.example.com/nokia/docs/${result.data.filename || file.name}`,
								questionId: questionId, // CRITICAL: Store the question ID
								sectionId: activeSection, // CRITICAL: Store the section ID
								// Store server response data for reference
								serverData: {
									nf_name: result.data.nf_name,
									section: result.data.section,
									version: result.data.version,
								},
							};

							uploadedFilesData.push(fileObj);
						} else {
							// Handle error
							failedUploads.push({
								name: file.name,
								error: result.data.message || `Upload failed: ${result.status}`,
							});

							// Set progress to show error
							setUploadProgress((prev) => ({
								...prev,
								[file.name]: -1, // Use negative value to indicate error
							}));
						}
					} catch (fileError) {
						// Handle individual file upload errors
						console.error(`Error processing file ${file.name}:`, fileError);
						failedUploads.push({
							name: file.name,
							error: fileError.message,
						});

						// Set progress to show error
						setUploadProgress((prev) => ({
							...prev,
							[file.name]: -1, // Use negative value to indicate error
						}));
					}
				}

				// Clear the timeout
				clearTimeout(uploadTimeout);

				// Add successfully uploaded files to the state
				if (uploadedFilesData.length > 0) {
					setUploadedFiles((prev) => [...prev, ...uploadedFilesData]);
				}

				// Show appropriate toast message based on results
				if (failedUploads.length === 0) {
					setToastMessage({
						type: "success",
						text: `${uploadedFilesData.length} ${uploadedFilesData.length === 1 ? "file" : "files"} uploaded successfully`,
						visible: true,
					});
				} else if (uploadedFilesData.length === 0) {
					const errorDetails = failedUploads.map((f) => `${f.name}: ${f.error}`).join("\n");
					setToastMessage({
						type: "error",
						text: `Failed to upload ${failedUploads.length} ${failedUploads.length === 1 ? "file" : "files"}`,
						details: errorDetails,
						visible: true,
					});
				} else {
					const failedNames = failedUploads.map((f) => f.name).join(", ");
					setToastMessage({
						type: "warning",
						text: `${uploadedFilesData.length} files uploaded successfully. ${failedUploads.length} files failed.`,
						details: `Failed files: ${failedNames}`,
						visible: true,
					});
				}
			} catch (error) {
				// Handle overall process errors
				console.error("Error during file upload process:", error);
				setToastMessage({
					type: "error",
					text: `Upload process failed: ${error.message}`,
					visible: true,
				});
			} finally {
				// Always reset uploading state
				setUploading(false);
			}
		};

		// Handle file removal
		const handleRemoveFile = async (id) => {
			try {
				// Find the file to be removed
				const fileToRemove = uploadedFiles.find((file) => file.id === id);

				if (!fileToRemove) {
					console.error("File not found for deletion:", id);
					setToastMessage({
						type: "error",
						text: `Error: File not found`,
						visible: true,
					});
					return;
				}

				// Show loading toast
				setToastMessage({
					type: "info",
					text: `Deleting file ${fileToRemove.name}...`,
					visible: true,
				});

				// Make sure we have the schema.sectionName for the API call
				const sectionName = schema.sectionName;

				console.log("Deleting file with parameters:", {
					fileName: fileToRemove.name,
					networkFunction,
					versionNumber,
					sectionName,
				});

				// Call the API to delete the file
				const result = await deleteFile(fileToRemove.name, networkFunction, versionNumber, sectionName);

				// Handle the API response
				if (result.success) {
					// Remove the file from local state
					setUploadedFiles((prev) => prev.filter((file) => file.id !== id));

					// Show success toast
					setToastMessage({
						type: "success",
						text: result.message || `File ${fileToRemove.name} deleted successfully`,
						visible: true,
					});
				} else {
					// Show detailed error toast
					console.error("Delete file API error:", result);
					setToastMessage({
						type: "error",
						text: result.message || `Failed to delete file: ${fileToRemove.name}`,
						visible: true,
					});
				}
			} catch (error) {
				console.error("Error in handleRemoveFile:", error);

				// Show error toast
				setToastMessage({
					type: "error",
					text: `Error deleting file: ${error.message}`,
					visible: true,
				});
			}
		};

		const handleFileDownload = (file) => {
			// Show loading toast
			setToastMessage({
				type: "info",
				text: `Preparing download for ${file.name}...`,
				visible: true,
			});

			// Call the download API
			try {
				downloadFile(file.name, networkFunction, versionNumber, schema.sectionName);

				// No need for a success toast since the browser will handle the download
			} catch (error) {
				console.error("Error initiating download:", error);

				// Show error toast
				setToastMessage({
					type: "error",
					text: `Error initiating download: ${error.message}`,
					visible: true,
				});
			}
		};

		// Handle checkbox changes for mechanisms
		const handleMechanismChange = useCallback(
			(mechanism) => {
				// Clear validation error if any
				if (invalidFields.includes("validationMechanisms")) {
					setInvalidFields((prev) => prev.filter((id) => id !== "validationMechanisms"));
				}

				// Update selected mechanisms
				setSelectedMechanisms((prev) => {
					const current = prev[activeSection] || [];
					const wasSelected = current.includes(mechanism);
					const willBeSelected = !wasSelected;

					// If selecting "other" and no text is entered yet, mark otherMechanism as invalid
					if (
						mechanism === "other" &&
						willBeSelected &&
						(!currentOtherMechanism || currentOtherMechanism.trim() === "")
					) {
						setInvalidFields((prev) => {
							if (!prev.includes("otherMechanism")) {
								return [...prev, "otherMechanism"];
							}
							return prev;
						});
					}
					// If unselecting "other", remove otherMechanism from invalidFields
					else if (mechanism === "other" && !willBeSelected) {
						setInvalidFields((prev) => prev.filter((id) => id !== "otherMechanism"));
					}

					// Update the mechanisms array
					const updated = wasSelected ? current.filter((item) => item !== mechanism) : [...current, mechanism];

					return {
						...prev,
						[activeSection]: updated,
					};
				});

				// IMPORTANT: Immediately update visibility for the otherMechanism field
				if (mechanism === "other") {
					// Determine if "other" will be selected after this change
					const currentMechs = selectedMechanisms[activeSection] || [];
					const isCurrentlySelected = currentMechs.includes(mechanism);
					const willBeSelected = !isCurrentlySelected;

					// Update visibility immediately
					setVisibleQuestions((prev) => {
						const currentSection = prev[activeSection] || {};
						return {
							...prev,
							[activeSection]: {
								...currentSection,
								otherMechanism: willBeSelected, // Show/hide based on selection
							},
						};
					});
				}
			},
			[activeSection, invalidFields, currentOtherMechanism, selectedMechanisms],
		);

		const handleOtherMechanismChange = useCallback(
			(value) => {
				// Clear validation error for this field if it's non-empty
				if (invalidFields.includes("otherMechanism") && value.trim() !== "") {
					setInvalidFields((prev) => prev.filter((id) => id !== "otherMechanism"));
				} else if (
					!invalidFields.includes("otherMechanism") &&
					value.trim() === "" &&
					currentMechanisms.includes("other")
				) {
					// Add validation error if field is emptied and "other" is selected
					setInvalidFields((prev) => [...prev, "otherMechanism"]);
				}

				setOtherMechanism((prev) => ({
					...prev,
					[activeSection]: value,
				}));
			},
			[activeSection, invalidFields, currentMechanisms],
		);

		// Close toast message
		const handleCloseToast = () => {
			setToastMessage((prev) => ({ ...prev, visible: false }));
		};

		// Group questions by card titles
		const groupedQuestions = React.useMemo(() => {
			return schema.questions.reduce((acc, question) => {
				if (question.cardTitle && currentVisibleQuestions[question.id]) {
					if (!acc[question.cardTitle]) {
						acc[question.cardTitle] = {
							title: question.cardTitle,
							icon: question.cardIcon,
							questions: [],
						};
					}
					acc[question.cardTitle].questions.push(question);
				} else if (!question.cardTitle && currentVisibleQuestions[question.id]) {
					// For questions without a card title, check if they're conditional to a parent
					const parent = schema.questions.find(
						(q) => q.conditionalQuestions && Object.values(q.conditionalQuestions).flat().includes(question.id),
					);

					if (parent && parent.cardTitle) {
						if (!acc[parent.cardTitle]) {
							acc[parent.cardTitle] = {
								title: parent.cardTitle,
								icon: parent.cardIcon,
								questions: [],
							};
						}
						acc[parent.cardTitle].questions.push(question);
					}
				}
				return acc;
			}, {});
		}, [schema.questions, currentVisibleQuestions]);

		// Handle validation before going to next section
		const validateAndGoToNext = useCallback(() => {
			// Only perform validation if user has attempted to submit previously
			if (hasAttemptedSubmit) {
				// Validate required fields for the current section
				const currentSectionValidation = validateRequiredFields();

				// Get validation state for all sections
				const allSectionsValidation = validateAllSections();
				const updatedInvalidSections = {
					...allSectionsValidation.invalidSections,
				};

				// If current section is now valid after fixing issues, remove it from invalid sections
				if (currentSectionValidation.isValid) {
					// Clear UI indicators for this section
					setInvalidFields([]);

					// Remove this section from invalid sections map
					delete updatedInvalidSections[activeSection];

					// Update parent component to refresh the left panel immediately
					if (ref.current && ref.current.updateInvalidSections) {
						console.log("Section is now valid, updating left panel:", updatedInvalidSections);
						ref.current.updateInvalidSections(updatedInvalidSections);
					}
				} else {
					// If still invalid, make sure parent has the updated validation state
					if (ref.current && ref.current.updateInvalidSections) {
						ref.current.updateInvalidSections(updatedInvalidSections);
					}
				}

				// Calculate next section
				const nextSection = activeSection + 1;

				// Clear invalid fields for current section as we're leaving
				setInvalidFields([]);

				// Navigate to next section first
				goToNextSection();

				// CRITICAL FIX: Set invalid fields for the next section if it has validation errors
				setTimeout(() => {
					if (updatedInvalidSections[nextSection] && updatedInvalidSections[nextSection].length > 0) {
						console.log("Setting invalid fields for next section:", nextSection, updatedInvalidSections[nextSection]);

						// Set invalid fields for the next section
						setInvalidFields(updatedInvalidSections[nextSection]);

						// If specific field access is needed:
						if (updatedInvalidSections[nextSection].length > 0) {
							setTimeout(() => {
								const firstInvalidField = document.getElementById(updatedInvalidSections[nextSection][0]);
								if (firstInvalidField) {
									firstInvalidField.scrollIntoView({
										behavior: "smooth",
										block: "center",
									});

									// Add a flash animation to the field
									if (firstInvalidField.classList) {
										firstInvalidField.classList.add("error-flash");
										setTimeout(() => {
											firstInvalidField.classList.remove("error-flash");
										}, 1000);
									}
								}
							}, 100);
						}
					}
				}, 300); // Delay to ensure navigation has completed
			} else {
				// If user hasn't attempted submit yet, no validation highlighting
				setInvalidFields([]);
				goToNextSection();
			}
		}, [
			activeSection,
			goToNextSection,
			hasAttemptedSubmit,
			setInvalidFields,
			validateAllSections,
			validateRequiredFields,
		]);

		const goToPreviousWithoutValidation = useCallback(() => {
			// Only perform validation if user has attempted to submit previously
			if (hasAttemptedSubmit) {
				// Validate all sections to accurately reflect state in parent component
				const allSectionsValidation = validateAllSections();

				// Check if the current section is now valid
				const currentSectionInvalid =
					allSectionsValidation.invalidSections[activeSection] &&
					allSectionsValidation.invalidSections[activeSection].length > 0;

				if (!currentSectionInvalid) {
					// If this section is now valid, make a copy without the current section
					const updatedInvalidSections = {
						...allSectionsValidation.invalidSections,
					};
					delete updatedInvalidSections[activeSection];

					// Update parent with the most current validation state
					if (ref.current && ref.current.updateInvalidSections) {
						ref.current.updateInvalidSections(updatedInvalidSections);
					}
				} else {
					// If still invalid, make sure parent has the updated validation state
					if (ref.current && ref.current.updateInvalidSections) {
						ref.current.updateInvalidSections(allSectionsValidation.invalidSections);
					}
				}

				// Clear invalid fields for current section since we're leaving
				setInvalidFields([]);
			}

			// Always proceed to previous section
			goToPreviousSection();
		}, [activeSection, goToPreviousSection, hasAttemptedSubmit, validateAllSections]);

		const validateAndGoToPrevious = useCallback(() => {
			// Validate all sections to accurately reflect state in parent component
			const allSectionsValidation = validateAllSections();

			// Check if the current section is now valid
			// If so, we want to update the parent component to remove it from invalid sections
			const currentSectionInvalid =
				allSectionsValidation.invalidSections[activeSection] &&
				allSectionsValidation.invalidSections[activeSection].length > 0;

			if (!currentSectionInvalid) {
				// If this section is now valid, make a copy without the current section
				const updatedInvalidSections = {
					...allSectionsValidation.invalidSections,
				};
				delete updatedInvalidSections[activeSection];

				// Update parent with the most current validation state
				if (ref.current && ref.current.updateInvalidSections) {
					ref.current.updateInvalidSections(updatedInvalidSections);
				}
			} else {
				// If still invalid, make sure parent has the updated validation state
				if (ref.current && ref.current.updateInvalidSections) {
					ref.current.updateInvalidSections(allSectionsValidation.invalidSections);
				}
			}

			// Always proceed to previous section, regardless of validation
			goToPreviousSection();
		}, [activeSection, goToPreviousSection, validateAllSections]);

		// Expose methods to parent components via ref
		React.useImperativeHandle(
			ref,
			() => ({
				clearCurrentSectionValidation: () => {
					setInvalidFields([]);
				},
				// Get all form responses
				getFormResponses: () => {
					const allSections = Object.values(sectionDataRef.current)
						.filter((section) => section.questions && section.questions.length > 0)
						.map((section) => ({
							sectionName: section.sectionName,
							questions: section.questions,
						}));

					return {
						nfName: networkFunction,
						version: versionNumber,
						sections: allSections,
					};
				},
				// Print JSON payload (save as draft)
				saveData: saveData,
				// Submit questionnaire (final submission)
				submitQuestionnaire: submitQuestionnaire,

				// New methods for validation
				// Validate all sections and return results
				validateAllSections: validateAllSections,

				// Validate all sections and notify parent component about invalid sections
				validateAndUpdateInvalidSections: validateAndUpdateInvalidSections,

				// Clear current section validation errors
				clearCurrentSectionValidation: () => {
					setInvalidFields([]);
				},

				// Set invalid fields directly - NEW METHOD
				setInvalidFields: (fieldIds) => {
					console.log("Setting invalid fields to:", fieldIds);

					// Force a state update even if fieldIds is the same array
					// This ensures the UI updates even if we're navigating between sections
					setInvalidFields([]);

					// Use setTimeout to ensure the state update above is processed first
					setTimeout(() => {
						setInvalidFields(Array.isArray(fieldIds) ? fieldIds : []);

						// Scroll to the first invalid field after a short delay
						if (Array.isArray(fieldIds) && fieldIds.length > 0) {
							setTimeout(() => {
								const firstInvalidField = document.getElementById(fieldIds[0]);
								if (firstInvalidField) {
									firstInvalidField.scrollIntoView({
										behavior: "smooth",
										block: "center",
									});

									// Add a flash animation to the field
									if (firstInvalidField.classList) {
										firstInvalidField.classList.add("error-flash");
										setTimeout(() => {
											firstInvalidField.classList.remove("error-flash");
										}, 1000);
									}
								}
							}, 100);
						}
					}, 10);
				},

				// Update a specific field's validation state
				setFieldValidity: (fieldId, isValid) => {
					if (!isValid && !invalidFields.includes(fieldId)) {
						setInvalidFields((prev) => [...prev, fieldId]);
					} else if (isValid && invalidFields.includes(fieldId)) {
						setInvalidFields((prev) => prev.filter((id) => id !== fieldId));
					}
				},

				// Get the current section's validation state
				getCurrentSectionValidation: () => {
					return {
						isValid: invalidFields.length === 0,
						invalidFieldIds: invalidFields,
					};
				},

				// Navigate to a specific question by ID
				scrollToQuestion: (questionId) => {
					const questionElement = document.getElementById(questionId);
					if (questionElement) {
						questionElement.scrollIntoView({
							behavior: "smooth",
							block: "center",
						});
						// Optional: highlight the field briefly
						questionElement.classList.add("highlight-animation");
						setTimeout(() => {
							questionElement.classList.remove("highlight-animation");
						}, 2000);
					}
				},
			}),
			[schema.sectionTitle, networkFunction, versionNumber, invalidFields],
		);

		const getInvalidFieldClass = (isInvalid, fieldType) => {
			if (!isInvalid) return "";

			// Base styles for all invalid fields
			const baseClass = "border-red-500 ring-2 ring-red-300 animate-pulse";

			// Add specific styles based on field type
			switch (fieldType) {
				case "text":
				case "number":
				case "textarea":
					return baseClass;
				case "radio":
				case "checkbox":
					return "border-red-500";
				case "file":
					return "border-red-500 bg-red-50";
				default:
					return baseClass;
			}
		};
		// Filter files for a specific question and section
		const getQuestionFiles = useCallback(
			(questionId) => {
				return uploadedFiles.filter((file) => file.questionId === questionId && file.sectionId === activeSection);
			},
			[uploadedFiles, activeSection],
		);

		// Helper to check if a field is invalid
		const isFieldInvalid = useCallback(
			(questionId) => {
				return invalidFields.includes(questionId);
			},
			[invalidFields],
		);

		// Render specific question types
		const renderQuestion = (question) => {
			if (!currentVisibleQuestions[question.id]) return null;

			switch (question.type) {
				case "radio":
					return renderRadioQuestion(question);
				case "checkbox":
					return renderCheckboxQuestion(question);
				case "text":
				case "number":
					return renderInputQuestion(question);
				case "textarea":
					return renderTextAreaQuestion(question);
				case "file":
					return renderFileUploadQuestion(question);
				case "info":
					return renderInfoQuestion(question);
				default:
					return (
						<div className="p-4 bg-yellow-50 border border-yellow-300 rounded">
							Unknown question type: {question.type}
						</div>
					);
			}
		};

		// Render info question (for placeholder sections)
		const renderInfoQuestion = (question) => {
			return (
				<div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
					<p className="text-gray-700">{question.text}</p>
				</div>
			);
		};

		// Render radio question
		const renderRadioQuestion = (question) => {
			const isInvalid = isFieldInvalid(question.id);

			return (
				<div className="mb-4" key={question.id}>
					<p className={`text-gray-700 mb-3 leading-relaxed text-base ${isInvalid ? "text-red-600 font-medium" : ""}`}>
						{question.text}
						{question.required && <span className="ml-1 text-red-500">*</span>}
						{isInvalid && <span className="ml-2 text-red-600 text-sm">Required</span>}
					</p>

					{question.options.length <= 3 ? (
						<div className="flex space-x-6 mt-4">
							{question.options.map((option) => (
								<label
									key={option.value}
									className={`flex items-center ${currentFormData[question.id] === option.value
											? option.color === "green"
												? "bg-green-50 border-green-200 hover:bg-green-100"
												: option.color === "red"
													? "bg-red-50 border-red-200 hover:bg-red-100"
													: "bg-blue-50 border-blue-200 hover:bg-blue-100"
											: "bg-gray-50 border-gray-200 hover:bg-gray-100"
										} p-3 rounded-lg border ${isInvalid ? "border-red-300" : "hover:border-blue-300"} transition cursor-pointer`}
								>
									<div className="relative">
										<input
											id={`${question.id}-${option.value}`}
											type="radio"
											name={question.id}
											value={option.value}
											checked={currentFormData[question.id] === option.value}
											onChange={() => handleInputChange(question.id, option.value)}
											className="h-5 w-5 text-blue-600 focus:ring-blue-500 opacity-0 absolute"
										/>
										<div
											className={`w-5 h-5 rounded-full ${currentFormData[question.id] === option.value
													? "border-0 bg-blue-600"
													: isInvalid
														? "border-2 border-red-400"
														: "border-2 border-gray-400"
												} inline-flex items-center justify-center`}
										>
											{currentFormData[question.id] === option.value && (
												<div className="w-2.5 h-2.5 rounded-full bg-white"></div>
											)}
										</div>
									</div>
									<div className="ml-3">
										<span
											className={`${currentFormData[question.id] === option.value
													? option.color === "green"
														? "text-green-800"
														: option.color === "red"
															? "text-red-800"
															: "text-blue-800"
													: "text-gray-700"
												} font-medium`}
										>
											{option.label}
										</span>
										{option.description && <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>}
									</div>
								</label>
							))}
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							{question.options.map((option) => (
								<label
									key={option.value}
									className={`flex items-center p-4 rounded-lg border-2 ${currentFormData[question.id] === option.value
											? option.color === "green"
												? "border-green-500 bg-green-50"
												: option.color === "red"
													? "border-red-500 bg-red-50"
													: "border-blue-500 bg-blue-50"
											: isInvalid
												? "border-red-300"
												: "border-gray-200 hover:border-blue-300"
										} transition-colors cursor-pointer`}
								>
									<input
										id={`${question.id}-${option.value}`}
										type="radio"
										name={question.id}
										checked={currentFormData[question.id] === option.value}
										onChange={() => handleInputChange(question.id, option.value)}
										className="h-4 w-4 text-blue-600 focus:ring-blue-500 hidden"
									/>
									<div
										className={`w-5 h-5 rounded-full flex items-center justify-center mr-3 ${currentFormData[question.id] === option.value
												? option.color === "green"
													? "bg-green-500"
													: option.color === "red"
														? "bg-red-500"
														: "bg-blue-500"
												: isInvalid
													? "border-2 border-red-400"
													: "border-2 border-gray-400"
											}`}
									>
										{currentFormData[question.id] === option.value && <CheckCircle2 size={12} className="text-white" />}
									</div>
									<div>
										<span
											className={`text-sm font-medium ${currentFormData[question.id] === option.value
													? option.color === "green"
														? "text-green-800"
														: option.color === "red"
															? "text-red-800"
															: "text-blue-800"
													: "text-gray-700"
												}`}
										>
											{option.label}
										</span>
										{option.description && <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>}
									</div>
								</label>
							))}
						</div>
					)}

					{isInvalid && <p className="mt-2 text-sm text-red-600">Please select an option</p>}
				</div>
			);
		};

		// Render checkbox question
		const renderCheckboxQuestion = (question) => {
			const isInvalid = isFieldInvalid(question.id);

			return (
				<div
					className={`mt-4 bg-blue-50 border ${isInvalid ? "border-red-300" : "border-blue-200"} rounded-lg p-4`}
					key={question.id}
				>
					<h3 className={`text-sm font-medium ${isInvalid ? "text-red-600" : "text-blue-800"} mb-2`}>
						{question.text}
						{question.required && <span className="ml-1 text-red-500">*</span>}
						{isInvalid && <span className="ml-2 text-red-600 text-sm">Required</span>}
					</h3>
					<div className="mt-2 space-y-2">
						{question.options.map((option) => (
							<div className="flex items-center" key={option.value}>
								<input
									id={`mechanism-${option.value}-${activeSection}`}
									name={`mechanisms-${activeSection}`}
									type="checkbox"
									value={option.value}
									checked={currentMechanisms.includes(option.value)}
									onChange={() => handleMechanismChange(option.value)}
									className={`h-4 w-4 ${isInvalid ? "text-red-600 border-red-300" : "text-blue-600 border-gray-300"} focus:ring-blue-500 rounded`}
								/>
								<label
									htmlFor={`mechanism-${option.value}-${activeSection}`}
									className="ml-2 block text-sm text-gray-700"
								>
									{option.label}
								</label>
							</div>
						))}

						{/* Show "Other" text input if "other" is selected */}
						{question.id === "validationMechanisms" && currentMechanisms.includes("other") && (
							<div className="mt-2 pl-6">
								<input
									id="otherMechanism"
									type="text"
									placeholder="Please specify other mechanisms"
									className={`w-full rounded-md ${isFieldInvalid("otherMechanism") ? "border-red-300 ring-1 ring-red-300" : "border-blue-300"} shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm`}
									value={currentOtherMechanism}
									onChange={(e) => handleOtherMechanismChange(e.target.value)}
								/>
								{isFieldInvalid("otherMechanism") && (
									<p className="mt-1 text-sm text-red-600">Please specify the other mechanism</p>
								)}
							</div>
						)}
					</div>

					{isInvalid && <p className="mt-2 text-sm text-red-600">Please select at least one option</p>}
				</div>
			);
		};

		// Render text/number input question
		const renderInputQuestion = (question) => {
			const isInvalid = isFieldInvalid(question.id);

			return (
				<div className={question.id === "otherMechanism" ? "mt-2 pl-6" : "mb-4"} key={question.id}>
					{question.id !== "otherMechanism" && (
						<label className="block text-base font-medium text-gray-800 mb-2">
							{question.text}
							{question.required && <span className="ml-1 text-red-500">*</span>}
							{question.highlight && (
								<span className="ml-2 inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
									{question.highlight}
								</span>
							)}
						</label>
					)}

					{question.unit ? (
						<div className="relative w-full md:w-1/3">
							{question.icon && (
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
									{getIconComponent(question.icon, 16)}
								</div>
							)}
							<input
								id={question.id}
								type={question.type}
								value={currentFormData[question.id] || ""}
								onChange={(e) => handleInputChange(question.id, e.target.value)}
								placeholder={question.placeholder || ""}
								className={`${question.icon ? "pl-10" : "pl-3"} block w-full rounded-lg border-2 ${isInvalid
										? "border-red-300 focus:ring-red-500 focus:border-red-500"
										: "border-blue-200 focus:ring-blue-500 focus:border-blue-500"
									} bg-white py-3 transition-shadow`}
							/>
							<div className="absolute inset-y-0 right-0 flex items-center">
								<label className="sr-only">Unit</label>
								<div className="h-full inline-flex items-center px-3 rounded-r-md border-l border-blue-200 bg-blue-50 text-blue-600 font-medium text-sm">
									{question.unit}
								</div>
							</div>
						</div>
					) : (
						<input
							id={question.id}
							type={question.type}
							value={currentFormData[question.id] || ""}
							onChange={(e) => handleInputChange(question.id, e.target.value)}
							placeholder={question.placeholder || ""}
							className={`w-full rounded-md ${isInvalid
									? "border-red-500 ring-2 ring-red-300 animate-pulse focus:ring-red-500 focus:border-red-500"
									: "border-blue-300 focus:ring-blue-500 focus:border-blue-500"
								} shadow-sm text-sm`}
						/>
					)}

					{question.description && <p className="mt-2 text-sm text-blue-600">{question.description}</p>}

					{isInvalid && <p className="mt-2 text-sm text-red-600">This field is required</p>}
				</div>
			);
		};

		// Render textarea question with validation
		const renderTextAreaQuestion = (question) => {
			const isInvalid = isFieldInvalid(question.id);

			return (
				<div className="mb-4" key={question.id}>
					<label className="block text-base font-medium text-gray-800 mb-2 whitespace-pre-line block">
						{question.text}
						{question.required && <span className="ml-1 text-red-500">*</span>}
						{question.highlight && (
							<span className="ml-2 inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
								{question.highlight}
							</span>
						)}
					</label>

					<div className="relative">
						{question.icon && (
							<div className="absolute inset-y-0 left-0 pl-3 pt-3 pointer-events-none">
								{getIconComponent(question.icon, 18)}
							</div>
						)}
						<textarea
							id={question.id}
							value={currentFormData[question.id] || ""}
							onChange={(e) => handleInputChange(question.id, e.target.value)}
							className={`${question.icon ? "pl-10" : ""} block w-full rounded-lg border-2 ${isInvalid
									? "border-red-300 focus:ring-red-500 focus:border-red-500"
									: "border-blue-200 focus:ring-blue-500 focus:border-blue-500"
								} shadow-sm bg-white p-4 text-base ${question.maxLength ? "resize-none" : "resize-y"} transition-shadow`}
							placeholder={question.placeholder || ""}
							rows={question.rows || 3}
						/>
						{question.maxLength && (
							<div className="absolute bottom-2 right-2 text-xs text-gray-400">
								{(currentFormData[question.id] || "").length || 0}/{question.maxLength}
							</div>
						)}
					</div>

					{question.description && <p className="mt-2 text-sm text-blue-600">{question.description}</p>}

					{isInvalid && <p className="mt-2 text-sm text-red-600">This field is required</p>}
				</div>
			);
		};

		// Render file upload question
		const renderFileUploadQuestion = (question) => {
			const questionFiles = getQuestionFiles(question.id);
			const isInvalid = isFieldInvalid(question.id);

			return (
				<div className="mt-4" key={question.id}>
					<div className="flex items-start mb-4">
						<div className={`${isInvalid ? "text-red-500" : "text-amber-500"} mr-2 mt-0.5 flex-shrink-0`}>
							<AlertCircle size={18} />
						</div>
						<div>
							<p className={`${isInvalid ? "text-red-600" : "text-gray-800"} text-base font-normal`}>
								{question.text}
								{question.required && <span className="ml-1 text-red-500">*</span>}
								{isInvalid && <span className="ml-2 text-red-600 text-sm">Required</span>}
							</p>
							<p className="text-sm text-blue-600 mt-1">
								You can upload up to {question.maxFiles} files. ({questionFiles.length}/{question.maxFiles} uploaded)
							</p>
						</div>
					</div>

					<div className={`mt-3 bg-blue-50 p-5 rounded-lg border ${isInvalid ? "border-red-300" : "border-blue-200"}`}>
						{/* File List */}
						{questionFiles.length > 0 && (
							<div className="mb-4">
								<h3 className="text-sm font-semibold text-gray-700 mb-2">Uploaded Files:</h3>
								<div className="space-y-2">
									{questionFiles.map((file) => (
										<div
											key={file.id}
											className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200 shadow-sm"
										>
											<div className="flex items-center flex-1 min-w-0">
												<div className="p-2 rounded shadow-sm mr-3 flex-shrink-0">
													{file.type.includes("pdf") ? (
														<svg
															xmlns="http://www.w3.org/2000/svg"
															className="h-6 w-6 text-red-500"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
														>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth={2}
																d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
															/>
														</svg>
													) : file.type.includes("word") ? (
														<svg
															xmlns="http://www.w3.org/2000/svg"
															className="h-6 w-6 text-blue-500"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
														>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth={2}
																d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
															/>
														</svg>
													) : (
														<svg
															xmlns="http://www.w3.org/2000/svg"
															className="h-6 w-6 text-gray-500"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
														>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth={2}
																d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
															/>
														</svg>
													)}
												</div>
												<div className="min-w-0 flex-1">
													<a
														href="#"
														onClick={(e) => {
															e.preventDefault();
															handleFileDownload(file);
														}}
														className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block"
													>
														{file.name}
													</a>
													<div className="flex text-xs text-gray-500 flex-wrap">
														<span className="block">{file.size}</span>
														<span className="mx-2">•</span>
														<span className="block">Uploaded {file.uploadDate}</span>
													</div>
													<div className="text-xs text-gray-400 mt-1 truncate">MD5: {file.checksum}</div>
												</div>
											</div>
											<div className="ml-2 flex-shrink-0">
												<button
													type="button"
													onClick={() => handleRemoveFile(file.id)}
													className="p-1.5 text-gray-500 hover:text-red-600 bg-white rounded-md shadow-sm border border-gray-200 hover:border-red-300 transition-colors"
												>
													<X size={16} />
												</button>
											</div>
										</div>
									))}
								</div>

								<div className="mt-3 flex justify-between items-center">
									<div className="text-sm font-medium text-blue-700">
										{questionFiles.length}/{question.maxFiles} files uploaded
									</div>
									<div className="text-sm font-medium text-blue-700">
										{totalUploadSizeInMB}/{maxUploadSizeInMB} MB used
									</div>
								</div>

								<div className="mt-1 text-xs text-gray-500">
									<span className="font-medium">Note:</span> Each file must be under {maxSingleFileSizeInMB} MB. All
									files combined must be under {maxUploadSizeInMB} MB.
								</div>
							</div>
						)}

						{/* Upload Area */}
						{questionFiles.length < question.maxFiles && (
							<div className="relative border-2 border-dashed border-blue-300 rounded-lg p-6 flex flex-col items-center justify-center bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer group">
								<div className="bg-white p-4 rounded-full text-blue-500 mb-3 shadow-md group-hover:shadow-lg transition-shadow">
									<Upload size={24} />
								</div>
								<p className="text-blue-800 font-medium mb-1">Drop files here or click to upload</p>
								<p className="text-blue-600 text-sm mb-2">
									{questionFiles.length === 0
										? "Upload MOPs or supporting documents"
										: `Add more files (${questionFiles.length}/${question.maxFiles} uploaded)`}
								</p>
								<p className="text-xs text-blue-500">PDF, DOCX, XLSX up to {maxSingleFileSizeInMB}MB each</p>
								<input
									id={question.id}
									type="file"
									multiple
									accept=".pdf,.docx,.xlsx"
									onChange={(e) => handleFileUpload(e, question.id)}
									className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
								/>
							</div>
						)}

						{isInvalid && <p className="mt-2 text-sm text-red-600">Please upload at least one file</p>}
					</div>
				</div>
			);
		};

		// Render form sections
		const renderFormSections = () => {
			// If it's a placeholder section, render a simple info card
			if (schema.questions.length === 1 && schema.questions[0].type === "info") {
				return (
					<div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
						<h2 className="text-xl font-bold text-gray-800 mb-4">{schema.sectionTitle} Form</h2>
						<p className="text-gray-600 mb-6">{schema.sectionDescription}</p>
						{renderInfoQuestion(schema.questions[0])}
					</div>
				);
			}

			return Object.values(groupedQuestions).map((group, index) => (
				<div
					key={group.title}
					className="bg-white rounded-lg overflow-hidden border-2 border-blue-200 shadow-md hover:shadow-lg transition-shadow mb-6"
				>
					<div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 flex items-center">
						<div className="bg-white p-2 rounded-md text-blue-600 mr-3 shadow-sm">{getIconComponent(group.icon)}</div>
						<h2 className="text-lg font-semibold text-white">{group.title}</h2>
						<div className="ml-auto bg-blue-500 text-white text-xs px-2 py-1 rounded">
							{index + 1} of {Object.keys(groupedQuestions).length}
						</div>
					</div>
					<div className="p-6 space-y-6">{group.questions.map((question) => renderQuestion(question))}</div>
				</div>
			));
		};

		// Get section color class
		const getSectionColorClass = (type) => {
			const colorMap = {
				blue: {
					gradient: "from-blue-600 to-blue-700",
					button: "from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900",
				},
				emerald: {
					gradient: "from-emerald-600 to-emerald-700",
					button: "from-emerald-600 to-emerald-800 hover:from-emerald-700 hover:to-emerald-900",
				},
				purple: {
					gradient: "from-purple-600 to-purple-700",
					button: "from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900",
				},
				amber: {
					gradient: "from-amber-600 to-amber-700",
					button: "from-amber-600 to-amber-800 hover:from-amber-700 hover:to-amber-900",
				},
				red: {
					gradient: "from-red-600 to-red-700",
					button: "from-red-600 to-red-800 hover:from-red-700 hover:to-red-900",
				},
				indigo: {
					gradient: "from-indigo-600 to-indigo-700",
					button: "from-indigo-600 to-indigo-800 hover:from-indigo-700 hover:to-indigo-900",
				},
				cyan: {
					gradient: "from-cyan-600 to-cyan-700",
					button: "from-cyan-600 to-cyan-800 hover:from-cyan-700 hover:to-cyan-900",
				},
			};

			return colorMap[schema.sectionColor || "blue"][type];
		};

		return (
			<div className="space-y-6 relative">
				{/* Navigation Controls - Top */}
				<div className="flex justify-between items-center mb-4">
					<div className="flex space-x-2">
						<SaveButton onClick={saveData} isSaving={isSaving} />
						{/* Only show Submit button on the last section */}
						{isLastSection && (
							<button
								onClick={onSubmit || submitQuestionnaire} // Use parent's onSubmit if provided, otherwise use local
								disabled={isSubmitting || isSaving}
								className={`px-6 py-3 rounded-lg font-medium flex items-center shadow-md bg-gradient-to-r text-white transition ${isSubmitting || isSaving
										? "from-green-400 to-green-600 cursor-not-allowed"
										: "from-green-600 to-green-800 hover:from-green-700 hover:to-green-900"
									}`}
							>
								{isSubmitting ? (
									<>
										<div className="animate-spin h-5 w-5 mr-2 border-2 border-t-white border-r-white border-b-white border-l-transparent rounded-full"></div>
										Submitting...
									</>
								) : (
									<>
										<CheckCircle2 size={20} className="mr-2" />
										Submit
									</>
								)}
							</button>
						)}
					</div>
					<div className="flex space-x-3">
						<button
							onClick={goToPreviousWithoutValidation}
							className={`px-6 py-3 border-2 rounded-lg font-medium flex items-center shadow-sm 
              ${isSaving || activeSection <= 0 ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"} 
              border-gray-300 text-gray-700 transition`}
							disabled={isSaving || activeSection <= 0}
						>
							<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
								<path
									fillRule="evenodd"
									d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
									clipRule="evenodd"
								/>
							</svg>
							Previous
						</button>
						<button
							onClick={validateAndGoToNext}
							className={`px-6 py-3 rounded-lg font-medium flex items-center shadow-md bg-gradient-to-r text-white transition ${isSaving || activeSection >= 12
									? "from-blue-400 to-blue-600 cursor-not-allowed"
									: "from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900"
								}`}
							disabled={isSaving || activeSection >= 12}
						>
							Next
							<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" viewBox="0 0 20 20" fill="currentColor">
								<path
									fillRule="evenodd"
									d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
					</div>
				</div>

				{/* Dynamic form sections */}
				{renderFormSections()}

				{/* Navigation Controls - Bottom */}
				<div className="flex justify-between items-center pt-4">
					<div className="flex space-x-2">
						<SaveButton onClick={saveData} isSaving={isSaving} />
						{/* Only show Submit button on the last section */}
						{isLastSection && (
							<button
								onClick={onSubmit || submitQuestionnaire} // Use parent's onSubmit if provided, otherwise use local
								disabled={isSubmitting || isSaving}
								className={`px-6 py-3 rounded-lg font-medium flex items-center shadow-md bg-gradient-to-r text-white transition ${isSubmitting || isSaving
										? "from-green-400 to-green-600 cursor-not-allowed"
										: "from-green-600 to-green-800 hover:from-green-700 hover:to-green-900"
									}`}
							>
								{isSubmitting ? (
									<>
										<div className="animate-spin h-5 w-5 mr-2 border-2 border-t-white border-r-white border-b-white border-l-transparent rounded-full"></div>
										Submitting...
									</>
								) : (
									<>
										<CheckCircle2 size={20} className="mr-2" />
										Submit
									</>
								)}
							</button>
						)}
					</div>
					<div className="flex space-x-3">
						<button
							onClick={goToPreviousWithoutValidation}
							className={`px-6 py-3 border-2 rounded-lg font-medium flex items-center shadow-sm 
              ${isSaving || activeSection <= 0 ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"} 
              border-gray-300 text-gray-700 transition`}
							disabled={isSaving || activeSection <= 0}
						>
							<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
								<path
									fillRule="evenodd"
									d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
									clipRule="evenodd"
								/>
							</svg>
							Previous
						</button>
						<button
							onClick={validateAndGoToNext} // Use the new validation function
							className={`px-6 py-3 rounded-lg font-medium flex items-center shadow-md bg-gradient-to-r text-white transition ${isSaving || activeSection >= 12
									? "from-blue-400 to-blue-600 cursor-not-allowed"
									: "from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900"
								}`}
							disabled={isSaving || activeSection >= 12}
						>
							Next
							<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" viewBox="0 0 20 20" fill="currentColor">
								<path
									fillRule="evenodd"
									d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
					</div>
				</div>

				{/* Toast notification */}
				<Toast message={toastMessage} onClose={handleCloseToast} />
			</div>
		);
	},
);

export default DynamicQuestionnaireForm;
