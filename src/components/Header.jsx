import { Link } from "react-router-dom";

function Header() {
  return (
    <header style={{ padding: 20, backgroundColor: "#f0f0f0", position: "relative", zIndex: 10 }}>
      <nav style={{ display: "flex", gap: "20px" }}>
        <Link to="/">Home</Link>
        <Link to="/about">Car Viewer 2</Link>
      </nav>
    </header>
  );
}

export default Header;