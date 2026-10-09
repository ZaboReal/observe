# Agent identifier registry

Generated from `packages/sensor/src/registry/drivers.ts` (70 drivers). Do not edit by hand; run `node scripts/registry-doc.mjs` after `pnpm build`.

**Acting** markers mean an agent is driving the page now. **Installed** markers only show a product is present and are used to name a driver once behaviour already says an agent is driving. Confidence: `source` (read in code), `teardown` (inspected live), `lab` (seen in our own runs), `docs`, `secondary` (one secondary source), `unverified`.

## Extension agents

### Claude in Chrome

`claude-in-chrome` · Anthropic · confidence: source · checked against 1.0.36 source; 1.0.90–1.0.94 teardowns

| | |
| --- | --- |
| Acting: page elements | `#claude-agent-glow-border`, `#claude-agent-glow-border-inner`, `#claude-agent-stop-container`, `#claude-agent-stop-button`, `#claude-phantom-cursor`, `#claude-phantom-cursor-plain`, `#claude-phantom-cursor-styled`, `#claude-static-indicator-container`, `.claude-agent-glow-border` |
| Residue (lingers after use) | `#claude-agent-animation-styles` |
| Keyframes | `claude-pulse` |
| Extension ids | `fcoeoabgfenejglbffodgkkbkcdhcgfn`, `dihbgbndebgnbjfmelmegjepbnkhlgni`, `dngcpimnedloihjnnfngkgjoidhnaolf` |
| Input mechanics | hover 80–130 ms; press 0–16 ms; key gap 0–2 ms; key hold 0–2 ms; typing: keys; scroll: wheel-100; pointer teleports; clicks at exact centre |

chrome.debugger (CDP 1.3), attached for the whole session. Click (1.0.36): hide overlays → 50 ms → one mouseMoved → 100 ms → mousePressed → 12 ms → mouseReleased; 1.0.90+ skips the delays when its UI is not foregrounded and sends force 0.5. Typing: ASCII as CDP keyDown/keyUp with no delay (Promise.all from 1.0.90), capitals with shiftKey but no Shift keydown; Input.insertText only for unmapped characters. form_input sets value in the isolated world, then fires untrusted change BEFORE input. Scroll: one mouseWheel of ticks×100 px, falling back to scrollBy (no wheel) and always in background tabs. MCP mode (Claude Code/Desktop/Cowork) shows the glow and cursor but no stop button. The animation <style> is never removed. Clones (claw-in-chrome, codex-in-chrome) reuse the same ids.

Sources: <https://github.com/ContextFort-AI/ContextFort> · <https://cheq.ai/blog/the-cyborg-session-reversing-detecting-claude-ai-agent-chrome-extension/> · <https://github.com/youseiushida/agent-in-chrome> · <https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn>

### ChatGPT for Chrome / Codex

`chatgpt-extension` · OpenAI · confidence: source · checked against content script 1.1.5; browser-service 26.915

| | |
| --- | --- |
| Acting: page elements | `#codex-agent-overlay-root`, `[data-codex-agent-overlay-root]`, `[data-codex-favicon-badge]`, `[data-codex-original-favicon-href]` |
| Acting: globals | `__codexAgentPopupInterceptor`, `__browserUseClipboardBridge` |
| Acting: postMessage types | `^[a-p]{32}:codex:wxt:content-script-started$`, `^[a-p]{32}:codex:wxt:locationchange$` |
| Extension ids | `hehggadaopoacecdllhhajmbjkdcmajg`, `odlomjlbamekndcpllcnffbgeohgkmjh`, `lfkehkpjohcoelkpembgemeipeppanef` |
| Input mechanics | press 0–3 ms; typing: synthetic-paste; scroll: gesture; pointer teleports; clicks at exact centre |

Raw CDP pipe driven by the desktop app's browser-service. Click: mouseMoved → mousePressed → mouseReleased with no delay and no force (pressure 0). Typing: an untrusted ClipboardEvent('paste') then the prototype value setter and an untrusted InputEvent with inputType ''; no key events. Scroll: synthesizeScrollGesture at speed 8000. Focus emulation keeps background tabs reporting focus. Agent tabs get a favicon badge and a closed-shadow overlay root. Requests from leased tabs may carry 'x-browser-agent: ChatGPT/<sessionId>' (server-side).

Sources: <https://github.com/iFurySt/open-browser-use> · <https://learn.chatgpt.com/docs/chrome-extension> · <https://github.com/wxt-dev/wxt>

### Manus Browser Operator

`manus-operator` · Manus · confidence: secondary

| | |
| --- | --- |
| Acting: page elements | `#manus-action-mask-host`, `[data-manus_clickable]`, `[data-manus_click_id]` |
| Acting: console markers | `Manus helper started` |
| Installed: page elements | `[manus-helper-ready]` |
| Installed: globals | `__manusOriginalPostMessage` |
| Extension ids | `cecngibhkljoiafhjfmcgbmikfogdiko`, `mljmkmodkfigdopcpgboaalildgijkoc` |
| Input mechanics | key gap 0.5–3 ms; typing: keys; pointer teleports |

CDP via the debugger permission. ~1.4 ms between keys and ~53 ms holds (FP-Agent). Monica's operator also writes data-manus_click_id; Monica is told apart by #monica-action-mask-host.

Sources: <https://manus.im/docs/features/browser-operator> · <https://arxiv.org/abs/2605.01247> · <https://github.com/asafev/TopShop>

### Monica operator

`monica` · Monica (Butterfly Effect) · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#monica-action-mask-host` |
| Installed: page elements | `#monica-content-root`, `[monica-id]` |
| Extension ids | `ofpnmcalabcbjgholdjcjblkibolbppb`, `fhimbbbmdjiifimnepkibjfjbppnjble` |

Overlay text 'Monica is browsing...', keyframes effect-pulse. Clicks are a single untrusted MouseEvent('click') with no down/up.

Sources: <https://chromewebstore.google.com/detail/ofpnmcalabcbjgholdjcjblkibolbppb>

### OpenClaw

`openclaw` · OpenClaw · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#__openclaw-annotations__`, `[data-openclaw-browser-ref]`, `[data-openclaw-cdp-ci]`, `[data-openclaw-labels]`, `[data-openclaw-mcp-overlay]` |
| Extension ids | `kcdjddhmeafeomebliikmbpblkmkfoig`, `naeanbdjhgjchiopliicmcokmcpdjool`, `bobkbcmgacnlomccmnaglobifoljcghb` |
| Input mechanics | press 0–3 ms; typing: insert-bulk; pointer teleports; clicks at exact centre |

Browser Relay: Playwright over chrome.debugger. One mouseMoved to the centre, press/release with 0 delay; fill = select-all + one Input.insertText; 'slowly' = keys every 75 ms. data-openclaw-browser-ref persists until the next snapshot.

Sources: <https://github.com/openclaw/openclaw> · <https://docs.claw.so/engine/tools/chrome-extension/>

### Genspark

`genspark` · Genspark · confidence: secondary

| | |
| --- | --- |
| Acting: page elements | `#gs-overlay-cursor-style` |
| Installed: page elements | `#genspark-float-bar` |
| Installed: globals | `navigator.genspark` |
| Browser identity | `Genspark/[\d.]+` |
| Extension ids | `hmdkfngkncmbgiehonfebecighedjiak` |

navigator.genspark identifies the Genspark AI Browser. Uses the debugger permission, so probably CDP input.

Sources: <https://github.com/asafev/TopShop>

### Nanobrowser

`nanobrowser` · Nanobrowser · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#puppeteer-disable-animations`, `.playwright-highlight-label` |
| Extension ids | `imbddededgmcgfhfpcjmijokokekbkal` |
| Input mechanics | press 0–3 ms; key hold 45–55 ms; typing: keys; scroll: no-wheel; pointer teleports; clicks at exact centre |

Puppeteer over chrome.debugger. Injects a main-world anti-detection script (navigator.webdriver getter → undefined, window.chrome stub, non-native navigator.permissions.query, attachShadow forced open). Typing clears with untrusted input/change, then keys held exactly 50 ms; <select> fires change then input; scroll with scrollBy. Shares #playwright-highlight-container with the browser-use family.

Sources: <https://github.com/nanobrowser/nanobrowser>

### Taxy AI

`taxy` · Taxy · confidence: source

| | |
| --- | --- |
| Acting: page elements | `[data-taxy-node-id]` |
| Installed: CSS probes | .web-agent-ripple → animationName: web-agent-ripple |
| Input mechanics | key gap 45–55 ms; typing: keys; pointer teleports |

Clicks are mousePressed/mouseReleased with no mouseMoved. Keys carry only text (empty key and code) at 50 ms gaps. Disables Dashlane and LastPass while running.

Sources: <https://github.com/TaxyAI/browser-extension>

### MultiOn

`multion` · MultiOn · confidence: secondary

| | |
| --- | --- |
| Acting: page elements | `#multion-root-…`, `#multion-popup-…`, `[multion-container]` |
| Extension ids | `ddmjhdbknfidiopmbaceghhhbgbpenmm` |

Removed from the Chrome Web Store on 2025-09-15; existing installs remain.

Sources: <https://chromewebstore.google.com/detail/ddmjhdbknfidiopmbaceghhhbgbpenmm>

### HyperWrite

`hyperwrite` · Otherside AI · confidence: source

| | |
| --- | --- |
| Installed: page elements | `#otherside-root`, `#hyper-main-container`, `#hyper-menu-shadow-root`, `#assistant-shadow-root` |
| Extension ids | `kljjoeapehcmaphfcjkmbhkinoaopdnd` |
| Input mechanics | typing: value-set |

Acts through @testing-library/user-event: untrusted pointer, mouse and key sequences at 0 ms.

Sources: <https://chromewebstore.google.com/detail/kljjoeapehcmaphfcjkmbhkinoaopdnd>

### HARPA AI

`harpa` · HARPA · confidence: source

| | |
| --- | --- |
| Installed: page elements | `<__hrp__>` |
| Installed: globals | `__hrp_globals`, `__app_hrp`, `__hrpc` |
| Extension ids | `eanggfilgoajaocelnaflolkadkeghjp` |
| Input mechanics | key gap 15–25 ms; typing: keys |

Globals and the <__hrp__> element are present whenever HARPA is installed, not only while it automates. Synthetic pointer/mouse events 50 ms apart; 20 ms key gaps.

Sources: <https://chromewebstore.google.com/detail/eanggfilgoajaocelnaflolkadkeghjp>

### Do Browser

`do-browser` · Do Browser · confidence: source

| | |
| --- | --- |
| Acting: postMessage types | `^hjcibkpfgnljonndnnanhkholafmgmip:content:wxt:content-script-started$` |
| Extension ids | `hjcibkpfgnljonndnnanhkholafmgmip` |

Puppeteer; typing starts with clickCount 4; scroll with scrollBy. Cursor is an unnamed closed-shadow div labelled 'Do Browser'.

Sources: <https://chromewebstore.google.com/detail/hjcibkpfgnljonndnnanhkholafmgmip>

### Sider agent

`sider` · Sider · confidence: source

| | |
| --- | --- |
| Acting: postMessage types | `^clickAt$`, `^pressKeyChord$`, `^scrollWheel$` |
| Installed: page elements | `<chatgpt-sidebar>` |
| Extension ids | `difoiogjjojoaoomphldepapgpbgkhkb`, `dhoenijjpgpeimemopealfcbiecgceod` |
| Input mechanics | typing: value-set |

Agent glow #sider-agent-glow-border lives inside the open shadow of <chatgpt-sidebar>. Input via user-event (untrusted).

Sources: <https://chromewebstore.google.com/detail/difoiogjjojoaoomphldepapgpbgkhkb>

### Bardeen

`bardeen` · Bardeen · confidence: source

| | |
| --- | --- |
| Acting: page elements | `[data-bardeen-agent-action]` |
| Installed: page elements | `#bardeen-root` |
| Extension ids | `ihhkmalpkhkoedlmcnilbbhhbhnicjga` |

Untrusted mousedown → click → mouseup (wrong order).

Sources: <https://chromewebstore.google.com/detail/ihhkmalpkhkoedlmcnilbbhhbhnicjga>

### page-agent

`page-agent` · Alibaba · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#page-agent-runtime_simulator-mask` |
| Extension ids | `akldabonmimlicnjlflnapfeklbfemhj` |

Sources: <https://github.com/alibaba/page-agent>

### AIPex

`aipex` · AIPex · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#aipex-border-overlay` |
| Keyframes | `aipexBreathe` |
| Installed: page elements | `#aipex-content-root` |
| Extension ids | `iglkpadagfelcpmiidndgjgafpdifnke` |

Sources: <https://chromewebstore.google.com/detail/iglkpadagfelcpmiidndgjgafpdifnke>

### Thunderbit

`thunderbit` · Thunderbit · confidence: secondary

| | |
| --- | --- |
| Acting: page elements | `#thunderbit-crx-scout-overlay` |
| Installed: page elements | `#thunderbit-crx-side-bar` |

Sources: <https://github.com/asafev/TopShop>

### rtrvr.ai

`rtrvr` · rtrvr.ai · confidence: secondary

| | |
| --- | --- |
| Extension ids | `jldogdgepmcedfdhgnmclgemehfhpomg` |

Writes rtrvr-* attributes on <html>.

Sources: <https://github.com/asafev/TopShop>

### Kimi WebBridge

`kimi-webbridge` · Moonshot AI · confidence: secondary

| | |
| --- | --- |
| Extension ids | `fldmhceldgbpfpkbgopacenieobmligc` |

Clicks are untrusted element.click().

Sources: <https://github.com/asafev/TopShop>

### Playwright MCP extension

`playwright-mcp` · Microsoft · confidence: source

| | |
| --- | --- |
| Extension ids | `mmlmfjhmonkocbjadbfplnigmagldckm`, `jakfalbnbhgkpmoaakfflhflbfpkailf` |
| Input mechanics | hover 0–5 ms; press 0–3 ms; typing: insert-bulk; pointer teleports; clicks at exact centre |

No content scripts or web-accessible resources. Click sends move/press/release together with force 0.5; fill = select() + one Input.insertText; every injected call uses userGesture:true.

Sources: <https://github.com/microsoft/playwright-mcp>

### Browser MCP

`browser-mcp` · Browser MCP · confidence: secondary

| | |
| --- | --- |
| Extension ids | `bjfgambnhccakkhmkepdoekmckoijdlc` |

Sources: <https://browsermcp.io/>

### mcp-chrome

`mcp-chrome` · hangwin · confidence: source

| | |
| --- | --- |
| Acting: postMessage types | `^rr-bridge-` |
| Extension ids | `hbdgbgagpkpjffpklnamcljpakneikee` |

Default click is an untrusted MouseEvent with screenX 0 and no pointer events.

Sources: <https://github.com/hangwin/mcp-chrome>

### Kapture

`kapture` · Kapture · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#kapture-cursor`, `.kapture-connected` |
| Installed: page elements | `.kapture-loaded` |
| Extension ids | `ejfnegenodbdcodemkibocefmajjjjbn` |

Sources: <https://github.com/williamkapke/kapture>

### BrowserTools MCP

`browsertools-mcp` · AgentDesk · confidence: source

| | |
| --- | --- |
| Installed: globals | `__btmcpInstalled`, `__btmcpBuffer` |

Sources: <https://github.com/AgentDeskAI/browser-tools-mcp>

## Agentic browsers

### ChatGPT / Codex desktop browser

`chatgpt-desktop` · OpenAI · confidence: source

| | |
| --- | --- |
| Installed: page elements | `#codex-browser-sidebar-comments-root` |
| Installed: globals | `__codexWebMcpModelContext` |
| Input mechanics | press 0–3 ms; typing: synthetic-paste; pointer teleports |

Electron webview driven over webContents.debugger with the same browser-service as the extension. The comments root and WebMCP bridge exist whether or not the agent acts. Network sec-ch-ua is rewritten; compare the header with navigator.userAgentData server-side.

Sources: <https://github.com/JimLiu/decode-codex> · <https://github.com/openai/codex>

### BrowserOS

`browseros` · BrowserOS · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#browseros-glow-overlay`, `#browseros-glow-stop-btn`, `#browseros-glow-styles`, `[data-__bcid]`, `[data-browseros-screenshot-annotation]`, `<browseros-neo-takeover>`, `<browseros-pointer>` |
| Keyframes | `browseros-glow-pulse`, `browseros-glow-fade-in` |
| Extension ids | `bflpfmnmnokmjhmgnolecpppdbdophmk`, `djhdjhlnljbjgejbndockeedocneiaei`, `pjimfkbpehlcllblajnpfamdfjhhlgkc`, `nlnihljpboknmfagkikhkdblbedophja` |
| Input mechanics | press 0–3 ms; typing: insert-bulk; pointer teleports |

Chromium fork with component extensions; uses the browser's own CDP, so no debugger infobar.

Sources: <https://github.com/browseros-ai/BrowserOS>

### Perplexity Comet

`comet` · Perplexity · confidence: teardown

| | |
| --- | --- |
| Acting: page elements | `#pplx-agent-overlay`, `#pplx-agent-overlay-stop-button`, `#pplx-agent-…` |
| Installed: CSS probes | #pplx-agent-0_0-overlay-stop-button → zIndex: 2147483647, minHeight: 32px |
| Extension ids | `npclhjbddhklpbnacpjloidibaggcgon`, `mcjlamohcooanphmebaiigheeeoplihb`, `pninphncmkphpjgfffammoenglghcjii` |
| Input mechanics | press 0–6 ms; typing: paste; pointer teleports |

Hidden comet-agent extension drives the page through chrome.debugger with no mousemove before clicks; pasted text; page reading via the accessibility tree. While active it swallows trusted user input. Overlay ids are pplx-agent-0_0-overlay(-base|-stop-button) (legacy pplx-agent-overlay); an overlay frame loads from the agent extension. Comet's CSS is on every page, so a planted stop-button element reveals the browser even with no task running. No Comet brand in client hints.

Sources: <https://blog.castle.io/from-detection-to-trust-the-evolving-challenge-of-ai-bot-authentication/> · <https://www.humansecurity.com/learn/blog/chatgpt-atlas-vs-perplexity-comet-agentic-browsers/> · <https://labs.zenity.io/post/perplexity-comet-a-reversing-story> · <https://arxiv.org/abs/2605.01247>

### Opera Neon

`opera-neon` · Opera · confidence: secondary

| | |
| --- | --- |
| Browser identity | `Opera`, `Opera GX`, `\bOPR/` |

Brand identifies Opera, not that the agent is acting. Neon's own UA and brand were not found.

Sources: <https://blogs.opera.com/news/2025/05/opera-neon-first-ai-agentic-browser/>

### ChatGPT Atlas (retired)

`atlas` · OpenAI · confidence: secondary

| | |
| --- | --- |
| Installed: globals | `ChatGPTBrowser` |
| Input mechanics | typing: paste; pointer teleports |

Shut down 9 Aug 2026. Input went straight to the renderer (trusted, no injection); stock Chrome UA and brands.

Sources: <https://techcrunch.com/2026/07/09/openai-is-shutting-down-atlas-but-its-ai-browser-ambitions-are-still-growing/> · <https://www.humansecurity.com/learn/blog/chatgpt-atlas-vs-perplexity-comet-agentic-browsers/>

### Sigma AI browser

`sigma` · Sigma · confidence: secondary

| | |
| --- | --- |
| Installed: page elements | `#__gradient_border_wrapper__`, `#sigma-translation-styles` |
| Installed: globals | `__SIGMA__` |

Agent mode bundles OpenClaw and Hermes.

Sources: <https://github.com/asafev/TopShop>

### Fellou

`fellou` · Fellou · confidence: secondary

| | |
| --- | --- |
| Installed: globals | `__FELLOU_TAB_ID__` |

Agent framework is Eko (see 'eko').

Sources: <https://github.com/asafev/TopShop>

### Google Antigravity browser

`antigravity` · Google · confidence: secondary

| | |
| --- | --- |
| Installed: page elements | `[data-jetski-tab-id]` |

Sources: <https://github.com/asafev/TopShop>

### Cursor IDE browser

`cursor-browser` · Anysphere · confidence: secondary

| | |
| --- | --- |
| Installed: globals | `__cursorDialogConfig` |

Sources: <https://github.com/asafev/TopShop>

## Agents built into browsers

### Gemini in Chrome (auto browse)

`gemini-in-chrome` · Google · confidence: source · checked against M157 main (2026-10-07)

| | |
| --- | --- |
| Input mechanics | hover 3–9 ms; press 3–9 ms; key gap 40–60 ms; key hold 20–30 ms; typing: keys; scroll: no-wheel; pointer teleports; clicks at exact centre |

Chromium actor (M153+ defaults; Finch can change them): one mousemove → 5 ms → mousedown → 5 ms → mouseup at the integer centre of the first client rect. Hover/move events never set a screen position (screenX 0 with clientX > 0). Typing: SelectAll with no Ctrl+A, keydown+char in one task, keyup 25 ms later, next key 25 ms after (≈50 ms; ≈10 ms above 45 chars; paste above 200 chars with a trusted paste event and no Ctrl+V). Capitals carry shiftKey with no Shift keydown. Scroll via scrollTo: no wheel. Select via SetValue: trusted input/change with no focus or pointer. Occluded targets get an accessibility click (no move, offsetX/offsetY 0, pressure 0). Forces focus and visibility on a background tab while acting. Nothing is injected into the page.

Sources: <https://chromium.googlesource.com/chromium/src/+/main/chrome/renderer/actor/click_dispatcher.cc> · <https://chromium.googlesource.com/chromium/src/+/main/chrome/renderer/actor/type_tool.cc> · <https://chromium.googlesource.com/chromium/src/+/main/chrome/renderer/actor/scroll_tool.cc> · <https://chromium.googlesource.com/chromium/src/+/main/chrome/common/chrome_features.cc>

### Brave Leo AI browsing

`brave-leo` · Brave · confidence: source

| | |
| --- | --- |
| Installed: globals | `navigator.brave` |
| Browser identity | `Brave` |
| Input mechanics | hover 3–9 ms; press 3–9 ms; key gap 40–60 ms; key hold 20–30 ms; typing: keys; scroll: no-wheel; pointer teleports; clicks at exact centre |

Same Chromium actor as Gemini in Chrome, in an isolated 'AI browsing' profile (no user cookies).

Sources: <https://github.com/brave/brave-core/tree/master/browser/ai_chat> · <https://brave.com/blog/ai-browsing/>

### Edge Copilot Mode

`edge-copilot` · Microsoft · confidence: docs

| | |
| --- | --- |
| Browser identity | `Microsoft Edge` |

Nothing injected into the page; inserts several characters per event (~16 chars/s). The brand identifies Edge, not that Copilot is acting.

Sources: <https://learn.microsoft.com/en-us/deployedge/microsoft-edge-management-browsing-with-copilot>

## Automation frameworks

### Midscene

`midscene` · ByteDance · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#water-flow-animation`, `[data-water-flow-pointer]` |
| Acting: globals | `midscene_element_inspector`, `midsceneNodeHashCache`, `midsceneGenerateHash`, `midsceneVisibleRect`, `midsceneWaterFlowAnimation`, `__MIDSCENE_NEW_TAB_INTERCEPTOR_INITIALIZED__` |
| Acting: console markers | `Blocked window.open:` |
| Keyframes | `waterflow` |
| Extension ids | `gbldofcpkknbggpkmbdaefngejllnief` |

Sources: <https://github.com/web-infra-dev/midscene>

### Skyvern

`skyvern` · Skyvern · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#boundingBoxContainer`, `#__pw-cursor`, `[data-skyvern-otp-box]`, `[data-skyvern-otp-filled]`, `[data-pw-overlay]`, `<skyvern-control-indicator>` |
| Acting: globals | `GlobalSkyvernFrameIndex`, `GlobalEnableAllTextualElements`, `globalOneTimeIncrementElements`, `globalDomDepthMap`, `globalListnerFlag`, `globalObserverForDOMIncrement`, `globalHoverStylesMap`, `globalParsedElementCounter`, `globalIncrementalJobCount`, `buildElementsAndDrawBoundingBoxes`, `removeAllUniqueIds`, `__PW_CURSOR_VIS__`, `__pw_trails` |
| Extension ids | `dhommdmblflboaledbbfkdaapkadphlp` |
| Input mechanics | key gap 8–13 ms; typing: keys; screens 1920x1080 |

Indicator text 'Skyvern is controlling this tab'. ~9.5 ms between keys; instant scroll-into-view.

Sources: <https://github.com/Skyvern-AI/skyvern> · <https://arxiv.org/abs/2605.01247>

### Chrome DevTools MCP

`chrome-devtools-mcp` · Google · confidence: lab · checked against 1.10.1 (bundled Puppeteer, Chrome 154) · built on `puppeteer`

| | |
| --- | --- |
| Acting: globals | `__dtmcp` |
| Acting: stack markers | `pptr:evaluateHandle;WaitForHelper.waitForStableDom`, `chrome-devtools-mcp%2Fbuild%2Fsrc` |
| Input mechanics | press 0–3 ms; pointer teleports; clicks at exact centre; screens 3840x2160 |

Built on Puppeteer, so Puppeteer's __ariaQuerySelector globals and its clicks (pressure 0, ~1 ms presses) and key-by-key typing appear too. Its own marker is in stack traces: after every action it starts a main-world MutationObserver from pptr:evaluateHandle;WaitForHelper.waitForStableDom, whose source URL holds the chrome-devtools-mcp path. Headless runs report a 3840×2160 screen (--screen-info). Focus emulation is always on. __dtmcp appears only with the experimental third-party tools category.

Sources: <https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/src/utils/WaitForHelper.ts> · <https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/src/BrowserManager.ts>

### Vercel agent-browser

`agent-browser` · Vercel · confidence: lab · checked against 0.38.2 (Chrome 154)

| | |
| --- | --- |
| Acting: page elements | `[data-agent-browser-located]`, `[data-agent-browser-recording-cursor]` |
| Installed: globals | `ModelContext`, `WebMCPEvent` |
| Input mechanics | press 0–3 ms; typing: insert-bulk; pointer teleports; clicks at exact centre |

A Rust CLI over raw CDP, not Puppeteer or Playwright. Launches Chrome with WebMCP testing on, so window.ModelContext exists. fill: an untrusted input event on the cleared field, then the whole string in one trusted insertText, no key presses. select fires only an untrusted change event. Clicks: CDP mouse events at the centre, pressure 0. find text/label/placeholder tags the target with data-agent-browser-located for a few ms; snapshot refs and CSS selectors leave nothing in the DOM.

Sources: <https://github.com/vercel-labs/agent-browser>

### browser-use

`browser-use` · Browser Use · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#playwright-highlight-container`, `#browser-use-debug-highlights`, `#browser-use-demo-panel`, `#browser-use-demo-toggle`, `#browser-use-demo-panel-style`, `[data-browser-use-interaction-highlight]`, `[data-browser-use-coordinate-highlight]`, `[data-browser-use-highlight]`, `[browser-user-highlight-id]` |
| Acting: globals | `__browserUseDemoPanelLoaded` |
| Acting: console markers | `browser-use highlight elements`, `=== BROWSER-USE HIGHLIGHTING ===` |
| Input mechanics | hover 40–70 ms; press 70–95 ms; key gap 0.5–8 ms; typing: keys; scroll: gesture; pointer teleports; clicks at exact centre; screens 1920x1080 |

v0.13: CDP without Runtime.enable. Click: scrollIntoViewIfNeeded → 50 ms → mouseMoved → 50 ms → mousePressed → 80 ms → mouseReleased at the quad centre. Typing: DOM.focus, clear via native setter + untrusted input/change, then per char keyDown → 5 ms → char → keyUp (~1 ms gaps), then an untrusted InputEvent, change and blur. Page scroll: synthesizeScrollGesture at speed 50000. Before each screenshot logs 'Removing N browser-use highlight elements'. Strips --enable-automation (webdriver false). #playwright-highlight-container and browser-user-highlight-id come from its buildDomTree script, which Nanobrowser, Monica, page-agent, UI-TARS and old Eko reuse.

Sources: <https://github.com/browser-use/browser-use/blob/main/browser_use/browser/watchdogs/default_action_watchdog.py>

### UI-TARS

`ui-tars` · ByteDance · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#gui-agent-helper-styles`, `#gui-agent-water-flow` |

Sources: <https://github.com/bytedance/UI-TARS-desktop>

### Playwright

`playwright` · Microsoft · confidence: source

| | |
| --- | --- |
| Acting: page elements | `<x-pw-glass>`, `<x-pw-highlight>`, `<x-pw-tooltip>`, `<x-pw-tooltip-line>`, `<x-pw-action-point>`, `<x-pw-action-cursor>`, `<x-pw-title>`, `<x-pw-user-overlays>`, `<x-pw-screencast-highlight>`, `<x-pw-screencast-point>` |
| Acting: globals | `__playwright__binding__`, `__playwright__binding__controller__`, `__pwInitScripts`, `__pwClock`, `__pwWebAuthnBinding`, `__pw_recorderState`, `__pw_recorderPerformAction`, `__pw_recorderRecordAction`, `__pw_resume`, `__pw_refreshOverlay`, `__pw_bidiInsertText`, `__pwSnapshotGlobals` |
| Acting: stack markers | `__playwright_evaluation_script__`, `UtilityScript.evaluate`, `UtilityScript.<anonymous>`, `__playwright_utility_world_` |
| Input mechanics | hover 0–5 ms; press 0–3 ms; typing: insert-bulk; pointer teleports; clicks at exact centre; screens 1280x720 |

1.53+ injects no globals by default (1.48–1.52 put __playwright__binding__ on every page; 1.46–1.52 __pwInitScripts). --remote-debugging-pipe sets webdriver. Focus emulation makes document.hasFocus() true even in hidden tabs. Click: one move to the centre, press (force 0.5) and release together. fill = Input.insertText; fill on date/color/range and selectOption = plain untrusted Event('input'/'change'). Headless default 1280×720, chromium-headless-shell UA/brands say HeadlessChrome.

Sources: <https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/input.ts> · <https://github.com/microsoft/playwright/issues/41873>

### Puppeteer

`puppeteer` · Google · confidence: source

| | |
| --- | --- |
| Acting: globals | `__ariaQuerySelector`, `__ariaQuerySelectorAll`, `puppeteer___ariaQuerySelector`, `puppeteer___ariaQuerySelectorAll` |
| Acting: stack markers | `__puppeteer_evaluation_script__`, `pptr:evaluate`, `pptr:internal`, `pptr://` |
| Input mechanics | press 0–3 ms; pointer teleports; clicks at exact centre; screens 800x600 |

exposeFunction adds window.puppeteer_<name> CDP bindings (found by the binding scan). --enable-automation sets webdriver. Default viewport 800×600; mouse events carry pressure 0; type = keyDown(text)+keyUp with no delay; sourceURL pptr:<fn>;<caller> (20.2+) leaks the caller's file path.

Sources: <https://github.com/puppeteer/puppeteer> · <https://blog.crawlex.net/blog/kasada-anti-instrumentation/>

### Selenium / ChromeDriver

`selenium` · Selenium · confidence: source

| | |
| --- | --- |
| Acting: globals | `_Selenium_IDE_Recorder`, `_selenium`, `callSelenium`, `__webdriver_script_fn`, `__webdriver_evaluate`, `__selenium_evaluate`, `__webdriver_unwrapped`, `__selenium_unwrapped`, `__fxdriver_evaluate`, `__driver_evaluate`, `__webdriverFunc`, `domAutomation`, `domAutomationController`, `$cdc_asdjflasutopfhvcZLmcfl_`, `cdc_adoQpoasnfa76pfcZLmcfl_Array`, `cdc_adoQpoasnfa76pfcZLmcfl_Object`, `cdc_adoQpoasnfa76pfcZLmcfl_Promise`, `cdc_adoQpoasnfa76pfcZLmcfl_Proxy`, `cdc_adoQpoasnfa76pfcZLmcfl_Symbol`, `cdc_adoQpoasnfa76pfcZLmcfl_JSON`, `cdc_adoQpoasnfa76pfcZLmcfl_Window`, `document.$cdc_asdjflasutopfhvcZLmcfl_`, `document.$chrome_asyncScriptInfo`, `document.__webdriver_script_fn`, `document.__driver_unwrapped` |
| Acting: console markers | `undetected chromedriver 1337!` |

Sources: <https://blog.crawlex.net/blog/kasada-anti-instrumentation/> · <https://api.switchfrog.com/sdk/v1.js>

### WebdriverIO

`webdriverio` · OpenJS · confidence: lab · checked against 10.0.0 over BiDi (ChromeDriver, Chrome 154) · built on `selenium`

| | |
| --- | --- |
| Acting: globals | `__wdio_element`, `__wdio_sinon` |
| Acting: console markers | `[WDIO]` |
| Acting: wrapped built-ins | `[WDIO]` |
| Installed: globals | `__name` |

Drives Chrome through ChromeDriver, so ChromeDriver's cdc_ globals (listed under Selenium) and its clicks and typing appear too. Its own marker: a BiDi preload script replaces Element.prototype.attachShadow and customElements.define with wrappers that log "[WDIO]", readable from page start. It also defines a global __name helper. Scrolls into view with one large trusted wheel step.

Sources: <https://github.com/webdriverio/webdriverio/blob/main/packages/webdriverio/src/scripts/customElement.ts> · <https://github.com/webdriverio/webdriverio/blob/main/packages/webdriverio/src/scripts/polyfill.ts>

### Cypress

`cypress` · Cypress.io · confidence: source

| | |
| --- | --- |
| Acting: globals | `Cypress`, `__cypress` |

Usually the customer's own end-to-end tests: allow-list rather than block.

Sources: <https://docs.cypress.io/>

### PhantomJS

`phantomjs` · PhantomJS · confidence: source

| | |
| --- | --- |
| Acting: globals | `_phantom`, `callPhantom` |
| Acting: user-agent tokens | `PhantomJS` |

Sources: <https://api.switchfrog.com/sdk/v1.js>

### Nightmare

`nightmare` · Segment · confidence: source

| | |
| --- | --- |
| Acting: globals | `__nightmare` |

Sources: <https://api.switchfrog.com/sdk/v1.js>

### Headless Chrome

`headless-chrome` · Google · confidence: source

| | |
| --- | --- |
| Acting: user-agent tokens | `HeadlessChrome` |
| Input mechanics | screens 800x600 |

chrome-headless-shell also lists a HeadlessChrome brand in userAgentData; new headless keeps the UA token but not the brand. Default screen 800×600 with availHeight equal to height.

Sources: <https://developer.chrome.com/docs/chromium/headless>

### Amazon Nova Act

`nova-act` · Amazon · confidence: source

| | |
| --- | --- |
| Acting: page elements | `[nova-act-id]` |
| Acting: user-agent tokens | ` Agent-NovaAct/[\d.]+` |
| Input mechanics | hover 0–5 ms; press 0–3 ms; key gap 90–110 ms; typing: keys; pointer teleports; clicks at exact centre; screens 1600x900 |

When it launches the browser itself the UA is the headless UA with ' Agent-NovaAct/x' appended (not when attached over CDP, e.g. AgentCore). Clicks at the exact centre with 0 ms delay; text over 10 chars uses insert_text (no keys), shorter text keyboard.type with 100 ms gaps. Fires untrusted pointerout/mouseleave after scrolling.

Sources: <https://github.com/aws/nova-act>

### Microsoft Fara

`fara` · Microsoft · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#red-cursor`, `[__elementId]` |
| Acting: globals | `MultimodalWebSurfer` |
| Input mechanics | press 8–14 ms; typing: keys; pointer teleports; clicks at exact centre; screens 1440x900 |

Playwright with a hard-coded Edg/122 UA (Fara-7B runs on Firefox, so the UA claims Edge without userAgentData). Viewport 1440×900. mouse.click(delay=10); typing at 0 ms (Fara 1.5) or 100 ms per char (Fara-7B).

Sources: <https://github.com/microsoft/fara>

### Microsoft Magentic-UI

`magentic-ui` · Microsoft · confidence: source

| | |
| --- | --- |
| Acting: globals | `WebSurfer` |

Same web-surfer stack as Fara (also writes __elementId attributes), global window.WebSurfer.

Sources: <https://github.com/microsoft/magentic-ui>

### Eko (Fellou)

`eko` · Fellou · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#eko-highlight-container`, `.eko-highlight-label`, `[eko-user-highlight-id]` |
| Acting: globals | `clickable_elements`, `get_clickable_elements`, `get_highlight_element`, `remove_highlight` |
| Input mechanics | typing: value-set |

Extension/web hosts dispatch untrusted mousedown/mouseup with clientX 0 then element.click(); hover is a bubbling mouseenter (real browsers never bubble it). Typing: native setter + one input event; select fires a non-bubbling change; scroll uses scrollBy.

Sources: <https://github.com/FellouAI/eko>

### Patchright

`patchright` · Kaliiiiiiiiii-Vinyzu · confidence: source

| | |
| --- | --- |
| Input mechanics | hover 0–5 ms; press 0–3 ms; typing: insert-bulk; pointer teleports; clicks at exact centre |

Undetected Playwright fork: no Runtime.enable, isolated-world evaluate. With init scripts it rewrites HTML to insert a self-removing <script class="<40 hex>" id="<44 hex>"> at the end of <head> and adds 'unsafe-eval' plus a nonce to the CSP (pattern-matched by the artifact watcher). Keeps Playwright's input traits.

Sources: <https://github.com/Kaliiiiiiiiii-Vinyzu/patchright>

### nodriver

`nodriver` · ultrafunkamsterdam · confidence: source

| | |
| --- | --- |
| Keyframes | `show-pointer-ani` |
| Input mechanics | press 0–3 ms; typing: insert-bulk; scroll: gesture; pointer teleports |

No Runtime.enable and a fixed debugging port (webdriver false). Element.click() is an untrusted el.click() preceded by a 500 ms red dot div#<16 hex> with z-index 99999999 (pattern-matched); @keyframes show-pointer-ani persists in a stylesheet. mouse_click = press + release with no move; send_keys = 'char' events only (no keydown/keyup); scroll gesture at speed 7777.

Sources: <https://github.com/ultrafunkamsterdam/nodriver>

### rebrowser-patches

`rebrowser` · rebrowser · confidence: source

Default addBinding mode leaves a random 10–20 char CDP binding on window (found by the binding scan); evaluated code carries sourceURL app.js. Unmaintained since May 2025.

Sources: <https://github.com/rebrowser/rebrowser-patches>

### LaVague

`lavague` · LaVague · confidence: source

| | |
| --- | --- |
| Acting: page elements | `.lavague-highlight` |
| Acting: globals | `_lavague_move_listener` |

Patches EventTarget.prototype.addEventListener and defines window.getEventListeners (normally DevTools-only). Hard-coded Chrome/107 Windows UA; 1080×1080.

Sources: <https://github.com/lavague-ai/LaVague>

### Agent-E

`agent-e` · EmergenceAI · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#agente-overlay`, `#AgentEOverlayBorder`, `#agente-closebutton`, `#AgentEExpandedAnimation`, `#agente-chat-box`, `.agente-ui-automation-highlight`, `[mmid]`, `[orig-aria-keyshortcuts]` |
| Acting: globals | `dom_mutation_change_detected`, `overlay_state_changed`, `show_steps_state_changed`, `user_response` |

Clicks with untrusted element.click(); keyboard.type delay 1 ms.

Sources: <https://github.com/EmergenceAI/Agent-E>

### AgentQL

`agentql` · TinyFish · confidence: source

| | |
| --- | --- |
| Acting: page elements | `[tf623_id]` |

Tags elements with tf623_id and iframe_path, sets window.domUpdateObserver and leaves localStorage key lastDomChange.

Sources: <https://pypi.org/project/agentql/>

### HyperAgent

`hyperagent` · Hyperbrowser · confidence: source

| | |
| --- | --- |
| Acting: page elements | `[data-hyperagent-id]` |
| Acting: globals | `__hyperagent_collectBoundingBoxes`, `__hyperagent_collectBoundingBoxesByXPath`, `__hyperagent_getScrollableElementXpaths` |
| Input mechanics | typing: insert-bulk |

Sources: <https://github.com/hyperbrowserai/HyperAgent>

### Magnitude

`magnitude` · Magnitude · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#action-visual-indicator`, `#type-effects-container` |
| Acting: globals | `__mouseEffectsInitialized`, `__typeEffectsInitialized`, `__magnitudeShadowDOMAdapterInjected`, `__tabActivityTime` |
| Input mechanics | screens 1024x768 |

Sources: <https://github.com/magnitudedev/magnitude>

### Anthropic browser tooling (main-world refs)

`anthropic-browser-tooling` · Anthropic · confidence: lab

| | |
| --- | --- |
| Acting: globals | `__claudeElementMap`, `__claudeRefCounter`, `__generateAccessibilityTree`, `__cdpBrowserRefs` |
| Input mechanics | press 0–3 ms; typing: insert-bulk; pointer teleports; clicks at exact centre |

Anthropic's reference browser-use demo and the Claude desktop app's built-in browser pane inject their element map into the page's main world (observed live on 2026-10-07: __claudeElementMap, __claudeRefCounter, __generateAccessibilityTree after a find/read). Claude in Chrome keeps the same names in an isolated world, invisible to pages. The built-in pane clicks via CDP with pressure 0 and ~1 ms presses and types with one Input.insertText.

Sources: <https://github.com/anthropics/claude-quickstarts>

## Cloud browsers and agents

### Stagehand / Browserbase

`stagehand` · Browserbase · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#__v3_cursor_overlay__`, `#stagehand-cursor`, `#stagehand-highlight`, `[data-stagehand-style]`, `[data-stagehand-mask]`, `[data-stagehand-mask-root]`, `[data-stagehand-mask-root-pos]` |
| Acting: globals | `__stagehandV3Injected`, `__stagehandV3__`, `__stagehandInjected`, `__stagehand__`, `__v3Cursor`, `__updateCursorPosition`, `__animateClick` |
| Acting: console markers | `[v3-piercer]` |
| Input mechanics | hover 0–5 ms; press 0–3 ms; typing: insert-bulk; pointer teleports; clicks at exact centre; screens 1280x800 |

v3 patches Element.prototype.attachShadow and logs '[v3-piercer] installed'; v2's stealth script sets the non-standard navigator.headless and fakes navigator.plugins. click() pipelines move + press + release (~0 ms) at the box centre; fill() = Backspace then Input.insertText. v4 moves to an isolated-world extension. Browserbase signs requests with Web Bot Auth (directory www.browserbase.com).

Sources: <https://github.com/browserbase/stagehand/blob/main/packages/extension/understudy/locator.ts>

### Google-Agent (cloud)

`google-agent` · Google · confidence: docs

| | |
| --- | --- |
| Acting: user-agent tokens | `compatible; Google-Agent` |

Cloud agents on Google infrastructure. Some requests are signed with Web Bot Auth (Signature-Agent g="https://agent.bot.goog"); verify at the edge.

Sources: <https://developers.google.com/crawling/docs/crawlers-fetchers/google-user-triggered-fetchers>

### Meta Muse

`meta-muse` · Meta · confidence: secondary

| | |
| --- | --- |
| Input mechanics | pointer teleports |

Cloud Chromium (plain Chrome/153 on Linux) driven by a CDP broker, exiting through Cloudflare/Fastly ranges, unsigned. Not the meta-externalagent crawler UA. Expected to adopt the Personal Agent Protocol.

Sources: <https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse>

### ChatGPT agent (cloud browser)

`chatgpt-agent` · OpenAI · confidence: secondary

| | |
| --- | --- |
| Input mechanics | typing: paste; pointer teleports; screens 1280x960 |

Now ChatGPT Work's cloud browser. Signs requests (Signature-Agent "https://chatgpt.com", legacy string form); verify at the edge rather than in the page.

Sources: <https://arxiv.org/abs/2606.30119> · <https://help.openai.com/en/articles/11845367-chatgpt-agent-allowlisting>

### Steel browser

`steel` · Steel · confidence: source

| | |
| --- | --- |
| Acting: page elements | `#__cursor__`, `<puppeteer-mouse-pointer>` |
| Input mechanics | screens 1920x1080 |

Fingerprint injection replaces console.debug, Object.keys, Object.getOwnPropertyNames, getContext and Worker in the main world (caught by the integrity probe); WebGL strings differ between the main thread and workers.

Sources: <https://github.com/steel-dev/steel-browser>

### Cloudflare Browser Run

`cloudflare-browser-run` · Cloudflare · confidence: docs

| | |
| --- | --- |
| Acting: user-agent tokens | `CloudflareBrowserRenderingCrawler/` |

Adds undeletable cf-brapi-request-id / cf-brapi-devtools headers and signs with Web Bot Auth (server-side).

Sources: <https://developers.cloudflare.com/browser-run/reference/automatic-request-headers>

## OS-level computer use

### OS-level computer use

`computer-use` · Anthropic / OpenAI reference agents · confidence: source

| | |
| --- | --- |
| Input mechanics | hover 0–20 ms; press 0–20 ms; key gap 10–14 ms; typing: keys; scroll: wheel-buttons; pointer teleports; screens 1024x768, 1280x800 |

Anthropic's reference demo runs Firefox ESR on Xvfb 1024×768. xdotool mousemove --sync (single jump), type --delay 12 in 50-character chunks, scroll by wheel-button clicks, ~2 s screenshot pause after every action.

Sources: <https://github.com/anthropics/claude-quickstarts/blob/main/computer-use-demo/computer_use_demo/tools/computer.py>

## Server-side identifiers

From `data/server-agents.json` (43 entries), for the server module. User-agent tokens are claims; confirm them with the IP list, reverse DNS or a Web Bot Auth signature.

| Operator | Product | Purpose | UA token | IP ranges | Reverse DNS | Web Bot Auth | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI | GPTBot | crawler | `GPTBot/` | <https://openai.com/gptbot.json> |  |  | high |
| OpenAI | OAI-SearchBot | search | `OAI-SearchBot/` | <https://openai.com/searchbot.json> |  |  | high |
| OpenAI | OAI-AdsBot | ads-check | `OAI-AdsBot/` | <https://openai.com/adsbot.json> |  |  | high |
| OpenAI | ChatGPT-User | user-fetch | `ChatGPT-User/` | <https://openai.com/chatgpt-user.json> |  |  | high |
| OpenAI | ChatGPT agent / ChatGPT Work cloud browser | agent | stock Chrome UA |  |  | `"https://chatgpt.com"` <https://chatgpt.com/.well-known/http-message-signatures-directory> | high |
| OpenAI | ChatGPT / Codex browser extension | agent | user's own browser |  |  |  | medium |
| Anthropic | ClaudeBot | crawler | `ClaudeBot/` | <https://claude.com/crawling/bots.json> |  |  | medium |
| Anthropic | Claude-User | user-fetch | `Claude-User/` | <https://claude.com/crawling/bots.json> |  |  | medium |
| Anthropic | Claude-SearchBot | search | `Claude-SearchBot` | <https://claude.com/crawling/bots.json> |  |  | medium |
| Anthropic | Claude Code WebFetch | user-fetch | `Claude-User (claude-code/` |  |  |  | high |
| Perplexity | PerplexityBot | search | `PerplexityBot/` | <https://www.perplexity.com/perplexitybot.json> |  |  | high |
| Perplexity | Perplexity-User | user-fetch | `Perplexity-User/` | <https://www.perplexity.com/perplexity-user.json> |  |  | high |
| Google | Googlebot and common crawlers | crawler | `Googlebot/` | <https://developers.google.com/static/crawling/ipranges/common-crawlers.json> | `crawl-*.googlebot.com`, `geo-crawl-*.geo.googlebot.com` |  | high |
| Google | Google-Agent | agent | `compatible; Google-Agent` | <https://developers.google.com/static/crawling/ipranges/user-triggered-agents.json> | `google-proxy-*.google.com` | `g="https://agent.bot.goog"` <https://agent.bot.goog/.well-known/http-message-signatures-directory> | high |
| Google | User-triggered fetchers (Google-GeminiNotebook, Google-Read-Aloud, FeedFetcher-Google, …) | user-fetch | `compatible; Google-` | <https://developers.google.com/static/crawling/ipranges/user-triggered-fetchers.json> | `*.gae.googleusercontent.com`, `google-proxy-*.google.com` |  | high |
| Microsoft | bingbot | crawler | `bingbot/` | <https://www.bing.com/toolbox/bingbot.json> | `msnbot-*.search.msn.com` |  | high |
| Meta | meta-externalagent / meta-externalfetcher / meta-webindexer | crawler / user-fetch | `meta-external` |  |  |  | high |
| Meta | Meta-ExternalTest | test | `meta-externaltest/` |  |  | <https://www.meta.com/.well-known/http-message-signatures-directory> | medium |
| Meta | Muse | agent | plain Chrome/153 on Linux, Cloudflare/Fastly egress, unsigned |  |  |  | low |
| Amazon | Amazonbot | crawler | `Amazonbot/` | <https://developer.amazon.com/amazonbot/ip-addresses/> | `*.crawl.amazonbot.amazon` |  | high |
| Amazon | Amzn-SearchBot | search | `Amzn-SearchBot/` | <https://developer.amazon.com/amazonbot/searchbot-ip-addresses/> |  |  | high |
| Amazon | Amzn-User (Alexa) | user-fetch | `Amzn-User/` | <https://developer.amazon.com/amazonbot/live-ip-addresses/> |  |  | high |
| Amazon | Nova Act | agent | ` Agent-NovaAct/` |  |  |  | high |
| Amazon | Buy For Me | agent | `Agent/AmazonBuyForMe` |  |  |  | low |
| Amazon | Bedrock AgentCore Browser | agent |  |  |  | <https://<id>.keydirectory.signer.<region>.on.aws/.well-known/http-message-signatures-directory> | high |
| Apple | Applebot | crawler | `Applebot/` | <https://search.developer.apple.com/applebot.json> | `*.applebot.apple.com` |  | high |
| Mistral | MistralAI-User | user-fetch | `MistralAI-User/` | <https://mistral.ai/mistralai-user-ips.json> |  |  | high |
| Mistral | MistralAI-Index | search | `MistralAI-Index` | <https://mistral.ai/mistralai-index-ips.json> |  |  | high |
| DuckDuckGo | DuckAssistBot | ai-answers | `DuckAssistBot/` | <https://duckduckgo.com/duckassistbot.json> |  | <https://assistbot.duckduckgo.com/.well-known/http-message-signatures-directory> | high |
| You.com | YouBot | search | `YouBot/` |  | `youbot-*.search.you.com` | <https://you.com/.well-known/http-message-signatures-directory> | high |
| Manus | Manus agent | agent | `Manus-User/` |  |  | <https://api.manus.im/.well-known/http-message-signatures-directory> | medium |
| Browserbase | Browserbase cloud browser | agent |  |  |  | <https://www.browserbase.com/.well-known/http-message-signatures-directory> | medium |
| Anchor | Anchor Browser | agent |  |  |  | <https://api.anchorbrowser.io/.well-known/http-message-signatures-directory> | high |
| Kernel | Kernel browsers | agent |  |  |  | `https://www.kernel.sh` <https://www.kernel.sh/.well-known/http-message-signatures-directory> | high |
| Apify | Website Content Crawler | crawler | `ApifyWebsiteContentCrawler/` |  |  | <https://api.apify.com/.well-known/http-message-signatures-directory> | high |
| Exa | ExaSearchBot | search | `ExaSearchBot/` |  |  | <https://crawler.exa.ai/.well-known/http-message-signatures-directory> | high |
| Cloudflare | Browser Run (Rendering) | agent / crawler | `CloudflareBrowserRenderingCrawler/` |  |  | <https://web-bot-auth.cloudflare-browser-rendering-085.workers.dev/.well-known/http-message-signatures-directory> | high |
| Moonshot | KimiBot / Kimi-User / Kimi-SearchBot | crawler / user-fetch / search | `Kimi` |  |  |  | medium |
| Common Crawl | CCBot | dataset | `CCBot/` | <https://index.commoncrawl.org/ccbot.json> | `*.crawl.commoncrawl.org` |  | high |
| Model Context Protocol | MCP fetch server | user-fetch | `ModelContextProtocol/1.0` |  |  |  | high |
| Google | Gemini CLI | user-fetch | `Google-Gemini-CLI/` |  |  |  | high |
| Cognition | Devin | agent | `Devin/` |  |  |  | medium |
| Genspark | Genspark AI Browser | agentic-browser | `Genspark/` |  |  |  | medium |

- Accept both Signature-Agent forms: the draft -00 dictionary (g="https://agent.bot.goog") and the legacy string ("https://chatgpt.com").
- Match keys by (directory URL, key). Not every directory uses RFC 7638 thumbprints as kid (Google uses short kids), so try kid first and fall back to computing the thumbprint.
- Visa TAP uses tags agent-browser-auth / agent-payer-auth with keys from https://mcp.visa.com/.well-known/jwks; route by tag.
- Commerce signers also publish directories: AGI Inc (api.agi.tech), Link (api.link.com), Strivve (signatures.cardsavr.io), PayPal (agentic-crawler-directory.guidedcrawler.workers.dev), Henry Labs, Rye, CartAI, Firmly, Lane, Klaviyo, Nekuda.
