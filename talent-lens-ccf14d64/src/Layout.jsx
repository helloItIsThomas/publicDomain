import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { LogOut, ShieldAlert } from 'lucide-react';

export default function Layout({ children, currentPageName }) {
  const showNav = currentPageName !== 'Apply';
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (err) {
        // Not logged in
      }
    };
    loadUser();
  }, []);

  return (
    <div className="min-h-screen bg-[#fafaf8]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600&display=swap');
        
        * {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        
        h1, h2, h3, h4, h5, h6, .brand-font {
          font-family: 'Outfit', system-ui, -apple-system, sans-serif;
        }

        .nav-blur {
          background: rgba(250,250,248,0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
      `}</style>
      
      {showNav && (
        <nav className="nav-blur border-b border-stone-200/60 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-between h-20">
              <Link 
                to={createPageUrl('Dashboard')} 
                className="flex items-center gap-3 group"
              >
                {/* Refined magnifying glass with person silhouette inside */}
                <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg" className="group-hover:scale-110 transition-transform">
                  <defs>
                    <linearGradient id="lens-fill" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
                      <stop offset="0%" stopColor="#fff7ed"/>
                      <stop offset="100%" stopColor="#ffedd5"/>
                    </linearGradient>
                    <linearGradient id="ring-grad" x1="0" y1="0" x2="38" y2="38" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#f97316"/>
                      <stop offset="100%" stopColor="#c2410c"/>
                    </linearGradient>
                    <clipPath id="lens-clip">
                      <circle cx="15.5" cy="15.5" r="11.5"/>
                    </clipPath>
                  </defs>
                  {/* Lens background */}
                  <circle cx="15.5" cy="15.5" r="11.5" fill="url(#lens-fill)"/>
                  {/* Person silhouette inside lens — clipped */}
                  <g clipPath="url(#lens-clip)">
                    {/* Head */}
                    <circle cx="15.5" cy="11" r="3.2" fill="#f97316"/>
                    {/* Shoulders / body arc */}
                    <path d="M8.5 22 Q8.5 15.5 15.5 15.5 Q22.5 15.5 22.5 22" fill="#f97316"/>
                  </g>
                  {/* Lens ring */}
                  <circle cx="15.5" cy="15.5" r="11.5" stroke="url(#ring-grad)" strokeWidth="2.5" fill="none"/>
                  {/* Handle — thick, rounded, angled */}
                  <line x1="24" y1="24" x2="34" y2="34" stroke="#c2410c" strokeWidth="3.5" strokeLinecap="round"/>
                </svg>
                <div>
                  <span className="brand-font text-2xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                    Resourceful
                  </span>
                  <div className="text-[10px] tracking-widest text-orange-600/60 font-medium uppercase -mt-1">
                    AI-POWERED PORTFOLIO ANALYSIS FOR CREATIVE RECRUITERS
                  </div>
                </div>
              </Link>

              <div className="flex items-center gap-4">
                {user?.role === 'admin' && (
                  <Link
                    to={createPageUrl('AdminDashboard')}
                    className="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    Platform Admin
                  </Link>
                )}
                {user && (
                  <button
                    onClick={() => base44.auth.logout()}
                    className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-orange-600 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Log out
                  </button>
                )}
              </div>
            </div>
          </div>
        </nav>
      )}
      <main>
        {children}
      </main>
    </div>
  );
}