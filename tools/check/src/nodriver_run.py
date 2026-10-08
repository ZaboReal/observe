"""Drive the sensor demo with nodriver and print the sensor's session id.

Usage: uv run --with nodriver python nodriver_run.py <url> [headless|headed]
"""
import asyncio
import os
import sys
import time

import nodriver as uc


async def main(url: str, mode: str) -> None:
    started = time.monotonic()
    browser = await uc.start(headless=mode != "headed", browser_executable_path=os.environ.get("CHROME_PATH"))
    try:
        tab = await browser.get(url)
        for _ in range(60):
            if await tab.evaluate("Boolean(window.ObserveSensor && window.ObserveSensor.instance)"):
                break
            await tab.sleep(0.25)

        # nodriver as shipped: Element.click(), send_keys() and select_option().
        q = await tab.select("#q")
        await q.click()
        await q.send_keys("northwind")
        paid = await tab.select("#status option:nth-child(2)")
        await paid.select_option()
        await (await tab.select("#export")).click()
        email = await tab.select("#email")
        await email.click()
        await email.send_keys("sam@example.com")
        await (await tab.select('#invite button[type="submit"]')).click()
        weekly = await tab.select("#weekly")
        await weekly.scroll_into_view()
        await weekly.click()

        # Let the sensor's delayed probes run, then send everything it holds.
        await tab.sleep(max(0.0, 3.5 - (time.monotonic() - started)))
        session_id = await tab.evaluate("window.ObserveSensor.instance.sessionId")
        await tab.evaluate("window.ObserveSensor.instance.destroy()")
        await tab.sleep(1.5)
        print(session_id)
    finally:
        browser.stop()


if __name__ == "__main__":
    uc.loop().run_until_complete(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "headless"))
