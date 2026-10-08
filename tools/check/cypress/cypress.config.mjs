// Cypress runs the sensor demo's tasks as an end-to-end spec. See src/frameworks.mjs (cypress).
import { defineConfig } from "cypress";

export default defineConfig({
  // Cypress 16 replaced Cypress.env() with exposed values; the runner passes these as environment variables.
  expose: { URL: process.env.OBSERVE_URL, OUT: process.env.OBSERVE_OUT },
  e2e: {
    supportFile: false,
    specPattern: "cypress/demo.cy.mjs",
    video: false,
    screenshotOnRunFailure: false,
    defaultCommandTimeout: 10000,
  },
});
