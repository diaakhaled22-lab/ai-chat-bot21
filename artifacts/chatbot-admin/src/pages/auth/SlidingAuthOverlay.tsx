import React, { useState } from "react";

/**
 * Modern Sliding Panel Overlay (Double Sign-In) Component
 * Built with React, Tailwind CSS, and Lucide/Inline SVGs
 */
export const SlidingAuthOverlay: React.FC = () => {
  // 1. State Management
  // false = Default state (Overlay on Right, Admin form visible on Left)
  // true = Active state (Overlay on Left, Client form visible on Right)
  const [isRightPanelActive, setIsRightPanelActive] = useState<boolean>(false);

  // Form input states
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  const [clientUsername, setClientUsername] = useState("");
  const [clientPassword, setClientPassword] = useState("");
  const [showClientPassword, setShowClientPassword] = useState(false);

  // Submit handlers
  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Admin Sign In:", { adminUsername, adminPassword });
  };

  const handleClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Client Sign In:", { clientUsername, clientPassword });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-tr from-slate-100 via-slate-200 to-indigo-100 font-sans antialiased text-slate-800">
      {/* 2. Main Container */}
      <div className="relative w-full max-w-4xl min-h-[540px] bg-white rounded-3xl shadow-2xl shadow-slate-400/30 overflow-hidden flex">
        
        {/* 3. The Forms (Background Layer) */}

        {/* LEFT SIDE: Admin Login Form */}
        <div
          className={`absolute top-0 left-0 w-1/2 h-full flex flex-col justify-center items-center px-8 sm:px-14 py-10 transition-all duration-700 ease-in-out ${
            !isRightPanelActive
              ? "z-10 opacity-100 pointer-events-auto"
              : "z-0 opacity-0 pointer-events-none"
          }`}
        >
          <div className="w-full max-w-sm flex flex-col items-center text-center">
            {/* Admin Shield Icon */}
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 shadow-sm border border-blue-100">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Admin Login</h2>
            <p className="text-xs text-slate-500 mt-1 mb-6">Enter administrative credentials</p>

            <form onSubmit={handleAdminSubmit} className="w-full flex flex-col gap-3.5" novalidate>
              {/* Username Input */}
              <div className="relative w-full text-left">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  required
                  placeholder="Admin Username"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all"
                />
              </div>

              {/* Password Input */}
              <div className="relative w-full text-left">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showAdminPassword ? "text" : "password"}
                  required
                  placeholder="Password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  aria-label="Toggle password visibility"
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showAdminPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Forgot Password Link */}
              <div className="flex justify-end pt-0.5">
                <a href="#forgot-admin" className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors">
                  Forgot Your Password?
                </a>
              </div>

              {/* Solid SIGN IN Button */}
              <button
                type="submit"
                className="w-full mt-2 py-3.5 px-6 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-bold tracking-wider uppercase rounded-xl shadow-lg shadow-blue-600/30 transition-all focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
              >
                SIGN IN
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT SIDE: Client Login Form */}
        <div
          className={`absolute top-0 right-0 w-1/2 h-full flex flex-col justify-center items-center px-8 sm:px-14 py-10 transition-all duration-700 ease-in-out ${
            isRightPanelActive
              ? "z-10 opacity-100 pointer-events-auto"
              : "z-0 opacity-0 pointer-events-none"
          }`}
        >
          <div className="w-full max-w-sm flex flex-col items-center text-center">
            {/* Client Icon */}
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 shadow-sm border border-indigo-100">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Client Login</h2>
            <p className="text-xs text-slate-500 mt-1 mb-6">Manage your chatbot deployment portal</p>

            <form onSubmit={handleClientSubmit} className="w-full flex flex-col gap-3.5" novalidate>
              {/* Username Input */}
              <div className="relative w-full text-left">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  required
                  placeholder="Client Username"
                  value={clientUsername}
                  onChange={(e) => setClientUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                />
              </div>

              {/* Password Input */}
              <div className="relative w-full text-left">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showClientPassword ? "text" : "password"}
                  required
                  placeholder="Password"
                  value={clientPassword}
                  onChange={(e) => setClientPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowClientPassword(!showClientPassword)}
                  aria-label="Toggle password visibility"
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showClientPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Forgot Password Link */}
              <div className="flex justify-end pt-0.5">
                <a href="#forgot-client" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline transition-colors">
                  Forgot Your Password?
                </a>
              </div>

              {/* Solid SIGN IN Button */}
              <button
                type="submit"
                className="w-full mt-2 py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-xs font-bold tracking-wider uppercase rounded-xl shadow-lg shadow-indigo-600/30 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2"
              >
                SIGN IN
              </button>
            </form>
          </div>
        </div>

        {/* 4. The Sliding Overlay (Foreground Layer) */}
        <div
          className={`absolute top-0 left-0 w-1/2 h-full z-50 overflow-hidden shadow-2xl transition-transform duration-700 ease-in-out bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-700 text-white ${
            isRightPanelActive
              ? "translate-x-0 rounded-r-[40px] md:rounded-r-[60px]"
              : "translate-x-full rounded-l-[40px] md:rounded-l-[60px]"
          }`}
        >
          {/* Sub-panel: Visible in Default State (When overlay is on the Right) */}
          <div
            className={`absolute inset-0 flex flex-col justify-center items-center px-10 text-center transition-all duration-700 ease-in-out ${
              !isRightPanelActive
                ? "opacity-100 translate-x-0 pointer-events-auto"
                : "opacity-0 -translate-x-12 pointer-events-none"
            }`}
          >
            {/* Robot Icon Badge */}
            <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center mb-5 shadow-inner">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>

            <h3 className="text-3xl font-extrabold tracking-tight">Bot Manager</h3>
            <p className="text-sm text-blue-100/90 mt-2.5 mb-7 max-w-xs leading-relaxed">
              Need access to client chatbot configurations and workspace dashboards?
            </p>

            {/* Ghost Button: CLIENT LOGIN */}
            <button
              type="button"
              onClick={() => setIsRightPanelActive(true)}
              className="border-2 border-white/90 text-white hover:bg-white hover:text-blue-700 text-xs font-bold tracking-widest uppercase py-3.5 px-9 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg shadow-black/10 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600"
            >
              CLIENT LOGIN
            </button>
          </div>

          {/* Sub-panel: Visible in Active State (When overlay is on the Left) */}
          <div
            className={`absolute inset-0 flex flex-col justify-center items-center px-10 text-center transition-all duration-700 ease-in-out ${
              isRightPanelActive
                ? "opacity-100 translate-x-0 pointer-events-auto"
                : "opacity-0 translate-x-12 pointer-events-none"
            }`}
          >
            {/* Robot Icon Badge */}
            <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center mb-5 shadow-inner">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>

            <h3 className="text-3xl font-extrabold tracking-tight">Bot Manager</h3>
            <p className="text-sm text-indigo-100/90 mt-2.5 mb-7 max-w-xs leading-relaxed">
              Switching back to system administration and core master controls?
            </p>

            {/* Ghost Button: ADMIN LOGIN */}
            <button
              type="button"
              onClick={() => setIsRightPanelActive(false)}
              className="border-2 border-white/90 text-white hover:bg-white hover:text-indigo-700 text-xs font-bold tracking-widest uppercase py-3.5 px-9 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg shadow-black/10 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-600"
            >
              ADMIN LOGIN
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SlidingAuthOverlay;
