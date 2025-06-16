// SaveButton.js
import React from 'react';

const SaveButton = ({ onClick, isSaving, className }) => {
  return (
    <button 
      onClick={onClick}
      disabled={isSaving}
      className={`px-6 py-3 border-2 rounded-lg font-medium flex items-center shadow-sm transition relative ${
        isSaving 
          ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed' 
          : 'border-blue-300 text-blue-700 hover:bg-blue-50'
      } ${className}`}
    >
      {isSaving ? (
        <>
          <div className="animate-spin h-5 w-5 mr-2 border-2 border-t-blue-600 border-r-blue-600 border-b-blue-600 border-l-transparent rounded-full"></div>
          Saving...
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
          </svg>
          Save Draft
        </>
      )}
    </button>
  );
};

export default SaveButton;