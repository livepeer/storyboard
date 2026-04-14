import React from "react";
import { Box, Text } from "ink";

export interface SplashProps {
  version: string;
}

export const Splash: React.FC<SplashProps> = ({ version }) => (
  <Box flexDirection="column" paddingY={1}>
    <Text bold color="cyan">  livepeer </Text>
    <Text dimColor>  agent sdk · v{version}</Text>
  </Box>
);
