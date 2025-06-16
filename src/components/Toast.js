// Toast.js
import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle, X } from 'lucide-react';

const Toast = ({ message, onClose }) => {
  useEffect(() => {
    // Auto-close the toast after 5 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [onClose]);
  
  if (!message.visible) return null;
  
  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center ${
      message.type === 'success' 
        ? 'bg-green-50 text-green-800 border-green-200' 
        : 'bg-red-50 text-red-800 border-red-200'
      } border rounded-lg shadow-lg px-4 py-3 max-w-sm animate-fade-in-right`}>
      <div className="mr-3">
        {message.type === 'success' ? (
          <CheckCircle size={20} className="text-green-500" />
        ) : (
          <AlertCircle size={20} className="text-red-500" />
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{message.text}</p>
      </div>
      <button 
        onClick={onClose}
        className="ml-4 text-gray-400 hover:text-gray-600 focus:outline-none"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default Toast;