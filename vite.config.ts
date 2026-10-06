import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Optional external toolchain keeps managed builds out of repository node_modules.
const paths = [process.env.SWARM_DEPENDENCIES || process.cwd()];
export default {
  base: "./",
  resolve: {
    alias: [
      {
        find: "react/jsx-runtime",
        replacement: require.resolve("react/jsx-runtime", { paths }),
      },
      {
        find: "react-dom/client",
        replacement: require.resolve("react-dom/client", { paths }),
      },
      {
        find: "react-dom",
        replacement: require.resolve("react-dom", { paths }),
      },
      { find: "react", replacement: require.resolve("react", { paths }) },
    ],
  },
  build: { sourcemap: false },
};
