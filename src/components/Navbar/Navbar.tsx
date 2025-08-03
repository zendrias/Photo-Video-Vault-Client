import React, { useState } from "react";
import { NavLink, type NavLinkProps } from "react-router-dom";
import "./NavBar.css";
import breedZ from "../../assets/breed-z-logo.svg";

type NavBarProps = {
  isAuthenticated: boolean;
};

const NavBar: React.FC<NavBarProps> = ({ isAuthenticated }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const toggleMenu = () => setIsOpen((prev) => !prev);

  const navLinkClass: NavLinkProps["className"] = ({ isActive }) =>
    isActive ? "nav-link active-link" : "nav-link";

  return (
    <header className="nav-wrapper">
      <nav className="nav-container">
        <div className="brand">
          <img src={breedZ} alt="Breed Z" height={40} />
        </div>

        <div
          className={`hamburger-icon ${isOpen ? "is-open" : ""}`}
          onClick={toggleMenu}
        >
          <span />
          <span />
          <span />
        </div>

        <ul className={`nav-list ${isOpen ? "open-menu" : ""}`}>
          {isAuthenticated ? (
            <>
              <li>
                <NavLink to="/" className={navLinkClass}>
                  Home
                </NavLink>
              </li>
              <li>
                <NavLink to="/vault" className={navLinkClass}>
                  Vault
                </NavLink>
              </li>
              <li>
                <NavLink to="/shared" className={navLinkClass}>
                  Shared
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
          ) : (
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
};

export default NavBar;
