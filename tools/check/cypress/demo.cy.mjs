// The sensor demo's five tasks, the way a Cypress test would do them. The run writes the sensor's session id
// to OBSERVE_OUT so the check runner can find the session in the console.
describe("sensor demo", () => {
  it("does the five tasks", () => {
    cy.visit(Cypress.expose("URL"));
    cy.window().its("ObserveSensor.instance").should("exist");
    cy.get("#q").click().type("northwind");
    cy.get("#status").select("Paid");
    cy.get("#export").click();
    cy.get("#email").click().type("sam@example.com");
    cy.get('#invite button[type="submit"]').click();
    cy.get("#settings").scrollIntoView();
    cy.get("#weekly").click();
    // Let the sensor's delayed probes run, then send everything it holds.
    cy.wait(3000);
    cy.window().then((win) => {
      const id = win.ObserveSensor.instance.sessionId;
      win.ObserveSensor.instance.destroy();
      cy.writeFile(Cypress.expose("OUT"), id);
    });
    cy.wait(1500);
  });
});
