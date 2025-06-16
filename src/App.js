import React from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import NFQuestionnaire from './components/Questionnaire';
import NaaviDashboard from './components/dashboard/NaaviDashboardCollapsible';

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-50">
        {/* Left Sidebar Navigation */}
        <div className="w-64 bg-gradient-to-r from-blue-900 to-blue-800 text-white shadow-lg">
          {/* Logo/Header Area */}
          <div className="p-4 border-b border-blue-700">
            <h1 className="text-2xl font-bold">NAAVI</h1>
          </div>

          {/* Navigation Links */}
          <nav className="mt-6">
            <ul className="space-y-2">
              <li>
                <NavLink
                  to="/questionnaire"
                  className={({ isActive }) =>
                    `flex items-center px-4 py-3 text-white hover:bg-blue-700 ${isActive ? 'bg-blue-600 font-medium border-l-4 border-white' : ''}`
                  }
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
                  </svg>
                  Questionnaire
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) =>
                    `flex items-center px-4 py-3 text-white hover:bg-blue-700 ${isActive ? 'bg-blue-600 font-medium border-l-4 border-white' : ''}`
                  }
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                    <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                  </svg>
                  Dashboard
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<NFQuestionnaire />} />
            <Route path="/questionnaire" element={<NFQuestionnaire />} />
            <Route path="/dashboard" element={<NaaviDashboard />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;