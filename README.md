# observe

Agent Passport Control: deciding which AI agents may act inside logged-in SaaS products, for whom, and with what permission.

## Code

- [packages/sensor](packages/sensor): browser SDK that detects AI agents driving a session, names the product (70-agent registry), and returns a passport at sensitive actions.
- [apps/console](apps/console): web console where a SaaS team sees which agents act in its product, for whom and what they do: overview, live sessions with the takeover marked, agents, accounts, an entry log with observe-mode policy decisions, and setup. Ingests the sensor's batches at `POST /api/v1/sdk/events`.
- [data/server-agents.json](data/server-agents.json): server-side agent user agents, IP-range lists and Web Bot Auth key directories, for the coming server module.

```bash
pnpm install
pnpm test              # sensor tests
pnpm dev:console       # console at http://localhost:3100 (demo traffic built in)
pnpm dev:sensor        # sensor demo at http://localhost:5317/examples/demo.html
```

To see a real session in the console, open the sensor demo and initialise the sensor with `endpoint: "http://localhost:3100/api"`.

## Docs

- [Agent Passport Control Market & Product Research.md](docs/Agent%20Passport%20Control%20Market%20&%20Product%20Research.md): market, standards, competitors and product definition
- [agent-passport-control-blueprint.html](docs/agent-passport-control-blueprint.html): build blueprint with a Switchfrog teardown, build stack, interactive detection walkthrough, visa flow, border-decision simulator, benchmark lab and roadmap. Open it in a browser.
- [objections.md](docs/objections.md): reply to "why visas when I can rate-limit my API or MCP?"
- [agent-registry.md](docs/agent-registry.md): every known browser agent and the identifiers it leaves (generated from the sensor's registry)
