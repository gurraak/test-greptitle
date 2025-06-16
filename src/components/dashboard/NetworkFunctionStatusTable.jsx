import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, AlertCircle, Loader, Search, X, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

// NetworkFunctionStatusTable component with global search, column filters and pagination
const NetworkFunctionStatusTable = ({ applicationData, totals, loading, error, networkFunctions = [] }) => {
  // State for global search
  const [globalSearch, setGlobalSearch] = useState('');
  
  // State for column filters
  const [columnFilters, setColumnFilters] = useState({
    id: '',
    NFs: '',
    notStarted: '',
    inProgress: '',
    completed: ''
  });
  const [filteredData, setFilteredData] = useState([]);
  
  // State for missing vendor modal
  const [missingVendorModal, setMissingVendorModal] = useState(false);
  const [selectedVendorRow, setSelectedVendorRow] = useState(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5); 
  
  // State to track which filter is expanded
  const [expandedFilter, setExpandedFilter] = useState(null);
  
  // Check if any filter is active
  const hasActiveFilters = Object.values(columnFilters).some(value => value !== '') || globalSearch !== '';

  // Calculate pagination values
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredData.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  
  // Toggle filter expansion
  const toggleFilter = (column) => {
    if (expandedFilter === column) {
      setExpandedFilter(null);
    } else {
      setExpandedFilter(column);
    }
  };
  
  // Clear all filters
  const clearAllFilters = () => {
    setColumnFilters({
      id: '',
      NFs: '',
      notStarted: '',
      inProgress: '',
      completed: ''
    });
    setGlobalSearch('');
    setExpandedFilter(null);
  };
  
  // Handle individual filter change
  const handleFilterChange = (column, value) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: value
    }));
  };

  // Handle global search change
  const handleGlobalSearchChange = (e) => {
    setGlobalSearch(e.target.value);
  };

  // Handle page changes
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  // Handle rows per page change
  const handleRowsPerPageChange = (e) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1); // Reset to first page when changing rows per page
  };
  
  // Handle click on row with missing vendor
  const handleMissingVendorClick = (app) => {
    setSelectedVendorRow(app);
    setMissingVendorModal(true);
  };
  
  // Close missing vendor modal
  const closeMissingVendorModal = () => {
    setMissingVendorModal(false);
    setSelectedVendorRow(null);
  };
  
  // Check if vendor is missing
  const isVendorMissing = (vendorId) => {
    return !vendorId || vendorId.trim() === '';
  };
  
  // Update filtered data when source data or filters change
  useEffect(() => {
    if (!applicationData) {
      setFilteredData([]);
      return;
    }
    
    // First apply global search
    let filtered = applicationData;
    
    if (globalSearch) {
      const searchTerm = globalSearch.toLowerCase();
      filtered = applicationData.filter(app => {
        // Search across all fields of the application
        return Object.values(app).some(value => 
          String(value).toLowerCase().includes(searchTerm)
        );
      });
    }
    
    // Then apply column filters
    if (Object.values(columnFilters).some(value => value !== '')) {
      filtered = filtered.filter(app => {
        // Check each column filter
        return Object.entries(columnFilters).every(([column, filterValue]) => {
          // Skip empty filters
          if (!filterValue) return true;
          
          // Convert values to strings for comparison
          const cellValue = String(app[column] || '').toLowerCase();
          const searchValue = filterValue.toLowerCase();
          
          return cellValue.includes(searchValue);
        });
      });
    }
    
    setFilteredData(filtered);
    
    // Reset to first page when filters change
    setCurrentPage(1);
  }, [applicationData, columnFilters, globalSearch]);

  // Close the filter when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('th')) {
        setExpandedFilter(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Handle loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <Loader className="mx-auto h-8 w-8 text-blue-600 animate-spin" />
          <p className="mt-2 text-gray-700">Loading table data...</p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <p className="mt-2 text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  // Export to CSV function
  const exportToCSV = () => {
    // Create CSV headers
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Vendor,Total NFs,Not Started,In Progress,Completed\n";
    
    // Add data rows
    filteredData.forEach(app => {
      csvContent += `${app.id || "Missing Vendor"},${app.NFs},${app.notStarted},${app.inProgress},${app.completed}\n`;
    });
    
    // Add totals row
    csvContent += `TOTALS,${totals.NFs},${totals.notStarted},${totals.inProgress},${totals.completed}\n`;
    
    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "network_function_status.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to render a column header with collapsible filter
  const renderColumnHeader = (title, column) => {
    const isExpanded = expandedFilter === column;
    const hasFilter = columnFilters[column] !== '';
    
    return (
      <th scope="col" className="px-6 py-3 bg-green-50">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleFilter(column)}
        >
          <div className="text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
            {title}
          </div>
          <div className="flex items-center">
            {hasFilter && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full mr-1">
                ✓
              </span>
            )}
            <Filter size={14} className={`${hasFilter ? 'text-blue-500' : 'text-gray-400'}`} />
          </div>
        </div>
        
        {isExpanded && (
          <div className="relative mt-2 transition-all duration-200" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={columnFilters[column]}
              onChange={(e) => handleFilterChange(column, e.target.value)}
              placeholder="Filter..."
              className="w-full pl-7 pr-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" size={12} />
          </div>
        )}
      </th>
    );
  };

  // Create page buttons array (for pagination)
  const getPageButtons = () => {
    const buttons = [];
    const maxButtonsToShow = 5; // Show at most 5 page buttons
    
    if (totalPages <= maxButtonsToShow) {
      // Show all pages if 5 or fewer
      for (let i = 1; i <= totalPages; i++) {
        buttons.push(i);
      }
    } else {
      // Always show first page
      buttons.push(1);
      
      // Calculate start and end page numbers
      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(startPage + 2, totalPages - 1);
      
      // Adjust if at end of range
      if (endPage === totalPages - 1) {
        startPage = Math.max(2, endPage - 2);
      }
      
      // Add ellipsis after page 1 if needed
      if (startPage > 2) {
        buttons.push('...');
      }
      
      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        buttons.push(i);
      }
      
      // Add ellipsis before last page if needed
      if (endPage < totalPages - 1) {
        buttons.push('...');
      }
      
      // Always show last page
      buttons.push(totalPages);
    }
    
    return buttons;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Network Function Status</h2>
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          {/* Global Search Bar - Compact Version */}
          <div className="relative w-48 sm:w-56">
            <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={globalSearch}
              onChange={handleGlobalSearchChange}
              placeholder="Search..."
              className="w-full pl-7 pr-7 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2"
              >
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          
          {/* Export button */}
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-300 text-green-700 text-sm rounded-lg hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          >
            <FileSpreadsheet size={18} />
            Export to CSV
          </button>
          
          {/* Clear filters button - only show when filters are active */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 px-3 py-2 bg-gray-100 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-200 focus:outline-none"
            >
              <X size={16} />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table with filterable columns */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              {renderColumnHeader('Vendor', 'id')}
              {renderColumnHeader('Total NFs', 'NFs')}
              {renderColumnHeader('Not Started', 'notStarted')}
              {renderColumnHeader('In Progress', 'inProgress')}
              {renderColumnHeader('Completed', 'completed')}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentRows.length > 0 ? (
              <>
                {currentRows.map((app) => {
                  const vendorMissing = isVendorMissing(app.id);
                  
                  return (
                    <tr 
                      key={app.id || 'missing-vendor'} 
                      className={`${vendorMissing ? 'bg-red-50 hover:bg-red-100 cursor-pointer' : 'hover:bg-gray-50'}`}
                      onClick={vendorMissing ? () => handleMissingVendorClick(app) : undefined}
                    >
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${vendorMissing ? 'text-red-700' : 'text-gray-900'}`}>
                        {vendorMissing ? 'Missing Vendor' : app.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {app.NFs}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          {app.notStarted}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          {app.inProgress}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {app.completed}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="bg-gray-50 font-medium">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                    TOTALS
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                    {totals.NFs}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-bold rounded-full bg-red-100 text-red-800">
                      {totals.notStarted}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-bold rounded-full bg-yellow-100 text-yellow-800">
                      {totals.inProgress}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-bold rounded-full bg-green-100 text-green-800">
                      {totals.completed}
                    </span>
                  </td>
                </tr>
              </>
            ) : (
              <tr>
                <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                  No Vendor found matching your search criteria
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {filteredData.length > 0 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4">
          <div className="flex flex-1 justify-between sm:hidden">
            {/* Mobile pagination */}
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{indexOfFirstRow + 1}</span> to{" "}
                <span className="font-medium">
                  {Math.min(indexOfLastRow, filteredData.length)}
                </span>{" "}
                of <span className="font-medium">{filteredData.length}</span> results
              </p>
            </div>
            <div className="flex items-center justify-between space-x-4 sm:space-x-6">
              {/* Rows per page selector */}
              <div className="flex items-center space-x-2">
                <label htmlFor="rowsPerPage" className="text-sm text-gray-700">
                  Rows per page:
                </label>
                <select
                  id="rowsPerPage"
                  name="rowsPerPage"
                  value={rowsPerPage}
                  onChange={handleRowsPerPageChange}
                  className="rounded-md border border-gray-300 py-1 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              {/* Pagination */}
              <nav className="inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                {/* Previous Button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-l-md px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Page buttons */}
                {getPageButtons().map((page, index) => (
                  page === '...' ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${page}`}
                      onClick={() => handlePageChange(page)}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-medium ${
                        page === currentPage
                          ? "bg-blue-500 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                          : "text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-1 focus:ring-blue-500"
                      }`}
                    >
                      {page}
                    </button>
                  )
                ))}

                {/* Next Button */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center rounded-r-md px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            </div>

          </div>
        </div>
      )}

      {/* Modal for displaying network functions without vendor */}
      {missingVendorModal && selectedVendorRow && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={closeMissingVendorModal}></div>

            {/* Modal panel */}
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <AlertCircle className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                      Network Functions Without Vendor
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 mb-4">
                        The following {selectedVendorRow.NFs} network functions do not have a vendor assigned:
                      </p>
                      
                      <div className="mt-2 max-h-60 overflow-y-auto bg-gray-50 rounded-md p-3">
                        <ul className="divide-y divide-gray-200">
                          {networkFunctions
                            .filter(nf => !nf.vendor || nf.vendor.trim() === '')
                            .map((nf, index) => (
                              <li key={index} className="py-2 text-sm">
                                <span className="font-semibold">{nf.name || nf.nf_name || `NF-${index + 1}`}</span> 
                              </li>
                            ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={closeMissingVendorModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkFunctionStatusTable;