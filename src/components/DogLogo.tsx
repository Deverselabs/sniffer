export default function DogLogo() {
  return (
    <div
      style={{
        fontFamily: "'Courier New', monospace",
        fontSize: 11,
        lineHeight: 1.25,
        whiteSpace: "pre",
        color: "#d4b896",
        textShadow: "0 0 8px rgba(212,184,150,0.3)",
      }}
    >
      {"/\\_/\\\n"}
      {"( "}
      <span style={{ color: "#AFA9EC", textShadow: "0 0 6px rgba(127,119,221,0.7)" }}>
        {"●.●"}
      </span>
      {" )\n"}
      {" > "}
      <span style={{ color: "#AFA9EC", textShadow: "0 0 6px rgba(127,119,221,0.7)" }}>
        S
      </span>
      {" <"}
    </div>
  );
}
