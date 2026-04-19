export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-8 py-16">
      <h2 className="text-3xl font-bold">Pick a Mission!</h2>
      <p className="text-center max-w-md" style={{ color: "var(--text-muted)" }}>
        Choose a creative challenge and learn how to make amazing things with AI.
      </p>
      <div className="text-6xl animate-bounce-in">🚀</div>
    </div>
  );
}
