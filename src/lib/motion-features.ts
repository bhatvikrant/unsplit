import { domMax } from "framer-motion";

// Loaded by LazyMotion in main.tsx. Its own module, so the bundler can give the features their own
// chunk: a dynamic import of "framer-motion" itself would keep the whole package in the entry chunk.
export default domMax;
