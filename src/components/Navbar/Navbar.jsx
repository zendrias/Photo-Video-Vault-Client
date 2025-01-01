import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './NavBar.css';
import breedZ from '../../assets/breed-z-logo.svg'
function NavBar({ isAuthenticated }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  // React Router v6 no longer supports "activeClassName" by default,
  // so we use a function to conditionally add "active-link".
  const navLinkClass = ({ isActive }) =>
    isActive ? 'nav-link active-link' : 'nav-link';

  return (
    <header className="nav-wrapper">
      <nav className="nav-container">
        {/* BRAND */}
        <div className="brand">
          <img src={breedZ} alt="Breed Z" height="40px"/>
        </div>

        {/* HAMBURGER / X ICON (visible on mobile) */}
        <div
          className={`hamburger-icon ${isOpen ? 'is-open' : ''}`}
          onClick={toggleMenu}
        >
          <span />
          <span />
          <span />
        </div>

        {/* NAV LINKS (horizontal on desktop, dropdown on mobile) */}
        <ul className={`nav-list ${isOpen ? 'open-menu' : ''}`}>
          {
            isAuthenticated ?
            <>
              <li>
                <NavLink to="/" className={navLinkClass}>
                  Home
                </NavLink>
              </li>
              <li>
                <NavLink to="/upload" className={navLinkClass}>
                  Upload
                </NavLink>
              </li>
              <li>
                <NavLink to="/logout" className={navLinkClass}>
                  Logout
                </NavLink>
              </li>
            </>
            : (
            <>
              <li>
                <NavLink to="/login" className={navLinkClass}>
                  Login
                </NavLink>
              </li>
              <li>
                <NavLink to="/signup" className={navLinkClass}>
                  Signup
                </NavLink>
              </li>
            </>
          )}
        </ul>
      </nav>
    </header>
  );
}

export default NavBar;
