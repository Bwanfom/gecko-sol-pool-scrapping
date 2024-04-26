import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const visitedLinksFile = path.join(__dirname, "visitedLinks.json");

(async () => {
  let browser;
  browser = await puppeteer.launch({
    headless: true,
    userDataDir: "./temp",
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(3.6e6);

  let currentPage = 1;
  const baseUrl = "https://www.geckoterminal.com/solana/pools?page=";

  let visitedLinks = [];

  if (fs.existsSync(visitedLinksFile)) {
    visitedLinks = JSON.parse(fs.readFileSync(visitedLinksFile, "utf8"));
  }

  while (true) {
    const url = baseUrl + currentPage;
    try {
      await page.goto(url, { waitUntil: "networkidle0" });

      await page.waitForSelector("table tbody tr");
      let trs = await page.$$("table tbody tr ");

      // Declare variables outside of the loop to store the parsed values
      function parseValue(value) {
        const numericPart = parseFloat(value.replace(/[^\d.]/g, ""));
        const multiplier = value.includes("K")
          ? 1e3
          : value.includes("M")
          ? 1e6
          : value.includes("B")
          ? 1e9
          : value.includes("T")
          ? 1e12
          : 1;

        return isNaN(numericPart) ? null : numericPart * multiplier;
      }

      for (let i = 0; i < trs.length; i++) {
        const tds = trs[i];
        const tdHandle = await trs[i].$("td:nth-child(11)"); // Select the 11th td element
        if (tdHandle) {
          const fdv = await page.evaluate(td => td.textContent, tdHandle);
          const fdvParse = parseValue(fdv);
          if (fdvParse > 500 && fdvParse < 100000) {
            const div = await tds.$("div");
            if (div) {
              const a = await div.$("a");
              if (a) {
                const href = await page.evaluate(
                  a => a.getAttribute("href"),
                  a
                );
                if (href && !visitedLinks.includes(href)) {
                  const fullUrl = new URL(href, baseUrl).href;
                  await page.goto(fullUrl, { waitUntil: "networkidle0" });

                  await Promise.all([
                    page.waitForSelector("main"),
                    page.waitForSelector("tbody"),
                    page.waitForSelector("tr"),
                  ]);

                  // Scrapping logic

                  //fdv MC Lq age holders volume
                  const data = await page.evaluate(() => {
                    const elements = document.evaluate(
                      '//*[@id="__next"]/div/main/div[1]/div[1]/div[3]/div[1]/table/tbody/tr',
                      document,
                      null,
                      XPathResult.ANY_TYPE,
                      null
                    );
                    const rows = [];
                    let row;

                    while ((row = elements.iterateNext()) !== null) {
                      const tds = row.querySelectorAll("td");
                      const rowData = Array.from(tds).map(td =>
                        td.textContent.trim()
                      );
                      rows.push(rowData);
                    }

                    return rows;
                  });

                  console.log(`Volume liquidity holders age FDV MC`, data);

                  //percentage change
                  const pChange = await page.evaluate(() => {
                    const elements = document.evaluate(
                      '//*[@id="__next"]/div/main/div[1]/div[1]/div[2]/div/div/div/div[3]/div[1]/div',
                      document,
                      null,
                      XPathResult.ANY_TYPE,
                      null
                    );
                    const rows = [];
                    let row;

                    while ((row = elements.iterateNext()) !== null) {
                      const span = row.querySelectorAll("span");
                      const rowData = Array.from(span).map(spn =>
                        spn.textContent.trim()
                      );
                      rows.push(rowData);
                    }

                    return rows;
                  });
                  console.log(`percentages`, pChange);

                  //name
                  const Name = await page.evaluate(() => {
                    const xpath =
                      '//*[@id="__next"]/div/main/div[1]/div[1]/div[2]/div/div/div/div[1]/div[1]/h1';
                    const element = document.evaluate(
                      xpath,
                      document,
                      null,
                      XPathResult.FIRST_ORDERED_NODE_TYPE,
                      null
                    ).singleNodeValue;
                    return element ? element.textContent.trim() : null;
                  });
                  console.log(`token name`, Name);

                  //address
                  (async () => {
                    const href = await page.evaluate(async () => {
                      const xpath =
                        '//*[@id="__next"]/div/main/div[1]/div[1]/div[3]/div[4]/table/tbody/tr[4]/td[2]/div[2]/a';
                      const element = document.evaluate(
                        xpath,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null
                      ).singleNodeValue;
                      const hrefAttribute = element
                        ? element.getAttribute("href")
                        : null;
                      if (hrefAttribute) {
                        return hrefAttribute.split(
                          "https://solana.fm/address/"
                        )[1];
                      } else {
                        return null;
                      }
                    });
                    console.log(`address`, href);
                  })();

                  visitedLinks.push(href);
                  fs.writeFileSync(
                    visitedLinksFile,
                    JSON.stringify(visitedLinks)
                  );

                  await page.goBack({ waitUntil: "networkidle0" });
                  await page.waitForSelector("table tbody tr td");
                  trs = await page.$$("table tbody tr");
                }
              }
            }
          }
        }
      }

      const nextPageButton = await page.$("nav a[aria-label='Next']");
      if (!nextPageButton) {
        console.log("No more pages to navigate");
        fs.writeFileSync(visitedLinksFile, JSON.stringify([]));
        break;
      }

      currentPage++;
    } catch (err) {
      console.error(`Error encountered`, err);
      fs.writeFileSync(visitedLinksFile, JSON.stringify([]));
      break;
    }
  }
  await page.close();
  await browser.close();
})();
