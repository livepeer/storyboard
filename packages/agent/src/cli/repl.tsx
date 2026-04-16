import React, { useState, useCallback } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { AgentRunner } from "../agent/runner.js";
import type { SlashRegistry } from "../skills/commands.js";

export interface ReplProps {
  runner: AgentRunner;
  slash: SlashRegistry;
}

interface Line {
  kind: "user" | "agent" | "system";
  text: string;
}

export const Repl: React.FC<ReplProps> = ({ runner, slash }) => {
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (line: string) => {
      if (!line.trim() || busy) return;
      setLines((l) => [...l, { kind: "user", text: line }]);
      setInput("");
      setBusy(true);

      const slashRes = await slash.run(line);
      if (slashRes) {
        setLines((l) => [...l, { kind: "system", text: slashRes.output }]);
      } else {
        try {
          const result = await runner.run({ user: line });
          setLines((l) => [
            ...l,
            { kind: "agent", text: result.finalText || "(no response)" },
          ]);
        } catch (e) {
          setLines((l) => [
            ...l,
            { kind: "system", text: `Error: ${(e as Error).message}` },
          ]);
        }
      }
      setBusy(false);
    },
    [busy, runner, slash],
  );

  return (
    <Box flexDirection="column">
      {lines.map((l, i) => (
        <Text
          key={i}
          color={
            l.kind === "user"
              ? "white"
              : l.kind === "agent"
                ? "cyan"
                : "yellow"
          }
        >
          {l.kind === "user" ? "› " : l.kind === "agent" ? "✦ " : "⚙ "}
          {l.text}
        </Text>
      ))}
      {!busy && (
        <Box>
          <Text>{"› "}</Text>
          <TextInput value={input} onChange={setInput} onSubmit={submit} />
        </Box>
      )}
    </Box>
  );
};
