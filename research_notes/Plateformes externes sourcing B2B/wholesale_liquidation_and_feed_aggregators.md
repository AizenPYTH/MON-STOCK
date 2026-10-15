# B2B wholesale/liquidation marketplaces and multi-supplier feed aggregators (electronics, smartphones, IT) for a small French reseller

> **How this was researched (read first).** Research date 2026-10-15. Direct page fetching (WebFetch/curl) was **blocked by the session's egress proxy** (merkandi.com, bigbuy.eu, syncee.com, inventorysource.com all refused with `connect_rejected`). Every finding below therefore comes from **web-search result snippets** of the cited URLs, not from full page reads. Prices and terms quoted from snippets should be re-checked on the live page before any decision. No sign-up, no login, no bypass.
>
> Status markers: **CONFIRMED** = stated on the vendor's own page/docs (as surfaced by search); **ANNOUNCED** = vendor marketing claim, or third-party review only; **HYPOTHESIS** = my inference; **à confirmer auprès du fournisseur** = not public.

## Q1. Liquidation / return-pallet / overstock marketplaces (Merkandi, Liquidation.com, B-Stock, Jobalots, Amazon EU, FR déstockage sites, Via Trading, Cdiscount)

### Takeaway
None of the liquidation marketplaces found offers a public buyer-side API or offer feed. The big ones (B-Stock, Liquidity Services) explicitly ban automated access in their ToS. Merkandi is the most relevant multi-supplier EU platform (an inquiry/contact directory, not a checkout). It has a seller-side XML import but no documented buyer API. French "palette Amazon" sellers usually say outright that they give no itemised manifest.

### Cited Findings
**Merkandi (PL, EU-wide B2B wholesale/stocklot directory)**
- Real functioning: sellers post offers and buyers contact them directly (internal messaging, phone, or a structured "order inquiry" that is "not an automatic purchase"). Profiles do not show e-mail addresses. **CONFIRMED** (FAQ). — [Merkandi FAQ (.us)](https://merkandi.us/faq); [How does Merkandi work?](https://merkandi.com/faq/how-does-merkandi-work/2)
- Terms: "The users are communicating directly between themselves, on their own expenses and responsibilities. Merkandi does not bear any responsibility for consequences of the transactions." So ordering is **direct with the supplier, not via the platform**. **CONFIRMED** — [Merkandi Terms and Conditions](https://merkandi.us/conditions)
- Smartphones category exists. Phones are offered in grades A/B/C ("Grade A units often supplied in their original packaging and with full documentation"), from a few devices to entire containers, with price and quantity negotiated directly with the supplier. **CONFIRMED** (category page) — [Merkandi smartphones category](https://merkandi.com/categories/smartphones-mobile-phones/87)
- Pricing (annual subscription, varies by country domain; sources conflict): merkandi.com/packages lists EUR 329 +VAT (Plus), EUR 549 +VAT (Business), EUR 869 +VAT (Enterprise), each for 12 months. UK domain shows Standard GBP 209 +VAT and Premium GBP 249 +VAT (−20%). The .us domain shows buyer Standard USD 100 (−50% from 200) per year and Premium USD 200 (−50% from 400) per year. Sellers pay an annual subscription and **no sales commission**. **CONFIRMED but inconsistent across domains** — [Merkandi packages](https://merkandi.com/packages); [Merkandi UK register](https://merkandi.co.uk/register); [Merkandi US welcome](https://merkandi.us/welcome); [Merkandi for sellers](https://merkandi.com/for-sellers)
- Feed: Merkandi accepts **seller-side XML product feeds** ("XML, the only format Merkandi accepts"), using Merkandi integer reference IDs for category, country and grade, downloadable as CSV lists. This is an **import for sellers**, not a buyer export. **CONFIRMED via third party (AdTribes plugin docs)** — [AdTribes: Merkandi product feed](https://adtribes.io/knowledge-base/how-to-set-up-a-merkandi-product-feed/)
- No buyer API or offer-export documentation was found in search. No explicit anti-scraping clause surfaced either (only the privacy policy on automated logging of device data). — [Merkandi privacy policy](https://merkandi.us/policies-privacy)

**Liquidity Services / Liquidation.com (US; also runs EU sites)**
- User Agreement: users may not "use spiders, crawlers, robots or any other similar means to access our Site or substantially download, reproduce or archive any portion of our Site, or otherwise engage in any data-mining activities". **CONFIRMED** — [Liquidity Services User Agreement](https://liquidityservices.com/user-agreement)
- The only API found is **seller-side**: a retailer sends its inventory to Liquidity Services by API, and they build pallet auctions. — [Liquidity Services case study](https://liquidityservices.com/case-studies/auction-software-that-optimizes-pallets-automatically-its-a-virtual-reality)
- The Liquidation.com-specific agreement found is dated "effective as of October 18, 2014", so it may be stale. — [Liquidation.com User Agreement](https://www.liquidation.com/c/terms.html)

**B-Stock (status/terms only, already excluded)**
- ToS forbid "any robot, spider, scraper, data mining tool, data gathering or extraction tool, or any other automated means, to access, collect, copy or record the Services" and copying content without written consent. **CONFIRMED** — [B-Stock Terms of Use](https://bstock.com/terms-of-use/)
- B-Stock runs **Amazon's official EU liquidation auctions**. All Amazon Europe buyers must keep a valid VAT ID on file. Lots run from single pallets to truckloads. **CONFIRMED** — [B-Stock Amazon EU](https://bstock.com/amazoneu/); [Amazon EU auctions](https://bstock.com/auctions/amazon-eu/); [B-Stock blog: buy Amazon return pallets](https://bstock.com/blog/where-how-to-buy-amazon-return-pallets/)
- Consequence: "Amazon Liquidations" in the EU means B-Stock, so the same ToS exclusion applies. **HYPOTHESIS, strongly supported by the above.**

**Jobalots (UK/EU, run by JLI Trading)**
- Auction platform for customer returns and liquidation stock. Electronics is a main category. Each lot is listed with a manifest, and returns are sold **unchecked**. **CONFIRMED** — [Jobalots](https://jobalots.com/en); [Jobalots about](https://jobalots.com/en/pages/about-us?currency=gbp); [JLI](https://jlitrading.com/)
- Warehouse location is inconsistent ("multiple warehouses across Europe" vs three warehouses in South and West Wales). — [Jobalots about](https://jobalots.com/en/pages/about-us?currency=gbp)
- Trustpilot has complaints about missing items versus the manifest. — [Trustpilot Jobalots](https://www.trustpilot.com/review/jobalots.com); 1,504 reviews on [Reviews.io](https://www.reviews.io/company-reviews/store/jobalots.com-1gJ4Xrr)
- No API or feed found.

**French "palettes de déstockage / retours Amazon" sellers**
- Easy Destocks (Mazé-Milon) sells lots from €350 and states it does **not** provide an item-by-item manifest: pallets are sold by category with an estimated resale value. — [Easy Destocks](https://easydestock.com/); [Easy Destocks à propos](https://easydestock.com/a-propos)
- wholesaleclearancepallets.fr states no item-level manifest exists for that format. — [wholesaleclearancepallets.fr](https://wholesaleclearancepallets.fr/product/amazon-warehouse-clearance-pallets-france/)
- grossiste-destockage-lots.fr: high-tech pallets of about 200–250 items (tablets, headsets, smartwatches, accessories), sold **by full truck only and untested**. — [grossiste-destockage-lots.fr](https://www.grossiste-destockage-lots.fr/lots-grossiste/palette-retours-amazon-electronique-destockage-high-tech-pour-professionnels/)
- A sourcing guide gives €200–800 per pallet depending on category, warns that a large share may be unsellable, warns about scams in online groups, and advises demanding a sample manifest and real photos before paying. — [Margeo blog](https://margeoapp.com/blog/sourcing-palettes-amazon-retours)
- Directories listing many FR destockers exist (no API): [Europages déstockage](https://www.europages.fr/fr/showroom/destockage-grossiste-palette); [Destockplus Amazon](https://www.destockplus.com/acheter/recherche-fournisseur-0-amazon.html)

### Inferences
- **HYPOTHESIS:** Merkandi is the only liquidation-type candidate that aggregates many EU suppliers and has smartphone grades, but its model (lead and inquiry, no cart, prices often "on request") means no reliable machine-readable price and stock. Automating it without written permission is a grey area: no ToS clause was found either way, so get written consent from Merkandi first.
- **HYPOTHESIS:** For return pallets, manifests range from "category plus estimated value" (FR sellers) to item lists without condition (Jobalots, unchecked). Neither is reliable enough to value iPhones or MacBooks automatically by grade, capacity or IMEI status.

### Gaps
- Merkandi buyer API or export: not found. Ask Merkandi (à confirmer auprès du fournisseur).
- Via Trading and Cdiscount pro déstockage: searches returned nothing usable. Not verified.
- Partner Liquidation, Retourwaren, Returnpallets, Lots-Stock, Stocklots, Dealer.co, Stockmarket: not searched for lack of time and fetch access. Status unknown.
- Merkandi number of suppliers and offers: not found in snippets.

## Q2. Specialised B2B marketplaces for used/refurbished smartphones (closest match to iPhone/MacBook/iPad needs)

### Takeaway
Specialised used-phone B2B marketplaces exist with standardised grading (Callisto, RecirQ, Mobile Depot). None publishes a buyer API in the material found. They match the product needs better than general liquidation sites, but automation needs a direct agreement with each one.

### Cited Findings
- **Callisto** (callisto.tech): B2B marketplace for used and refurbished phones, laptops and tablets. Stock comes from OEMs, carriers and retailers. Buying is by auction, catalogue (fixed price) or offer. Payments are escrow-secured, sellers go through full KYC, and grades are A, B, Z, C, W (mixed lot), D and Dx, "supported by functional testing, diagnostics, secure data wipe and cosmetic checks" (grading tech by Alchemy). **ANNOUNCED** (vendor marketing) — [Callisto](https://callisto.tech/); [Callisto grading](https://callisto.tech/blog/how-grading-works-for-wholesale-smartphones-laptops-and-tablets); [How it works](https://callisto.tech/how-it-works); [Wholesale used smartphones](https://callisto.tech/wholesale-used-smartphones-on-callisto)
- No Callisto API or buyer fee schedule found. — same sources
- **RecirQ**: wholesale marketplace for used smartphones, grades OB to D (incl. PTB/PTG), ships to EU resellers. The page is about 580 days old. **ANNOUNCED** — [RecirQ](https://www.recirqglobal.com/)
- **Mobile Depot** (EU B2B mobile wholesaler) shows per-unit EUR prices with grade, e.g. Galaxy Z Flip 4 128 GB Grade A at €156 (page about 540 days old). — [Mobile Depot](https://www.mobiledepot.eu/)
- **Mobile Phones Factory**: graded used stock under the margin VAT scheme; some refurbished stock has a 3-month warranty. — [Mobile Phones Factory](https://www.mobilephonesfactory.com/)
- Europages lists many refurbished-phone wholesalers, but as a directory with non-standard listings. — [Europages refurbished mobile phones](https://www.europages.co.uk/companies/distributor/refurbished-mobile-phones.html)

### Inferences
- **HYPOTHESIS:** Callisto is the most structured candidate for refurbished iPhones (standard grades, escrow, catalogue mode). If it ever offers a buyer API or export, it would fit MON STOCK's data model (grade, capacity, quantity, price). This is à confirmer auprès du fournisseur.
- **HYPOTHESIS:** Mobile Depot and Mobile Phones Factory are single wholesalers, not aggregators. They fit the existing one-adapter-per-supplier pattern (like Bitstockz or Hurtel), not the "one platform, many suppliers" goal.

### Gaps
- Foxway, Refurbed B2B, Swappie B2B, Phonebox, Techtrade: no results. Status unknown.
- Callisto access conditions (KYC documents, fees, MOQ, EU/FR VAT handling): not public in the snippets.

## Q3. Dropshipping / multi-supplier feed aggregators (Syncee, Inventory Source, Flxpoint, BigBuy, Brandsdistribution, VidaXL, Spocket, Wholesale2B, Ankorstore)

### Takeaway
The aggregators with documented APIs are either US-centric (Inventory Source, Flxpoint, Wholesale2B) or not focused on electronics (Brandsdistribution is fashion, VidaXL is home and garden). Syncee is EU-friendly but its API is "contact support" only. BigBuy remains the best-documented EU single-wholesaler API with an electronics category, but it is one supplier, not many.

### Cited Findings
**BigBuy (ES, already partly integrated)**
- Catalogue: "+400,000 references", full catalogue access. **CONFIRMED** (BigBuy page) — [BigBuy wholesaler packs](https://www.bigbuy.eu/en/wholesaler-packs.html); 400k across electronics, home, toys etc. per [Alidropship 2026 review](https://alidropship.com/is-bigbuy-legit/)
- Packs: "advanced API integration (catalog, orders, tracking, shipping cost calculation and invoicing)". **CONFIRMED** — [BigBuy wholesaler packs](https://www.bigbuy.eu/en/wholesaler-packs.html)
- Prices (third party, conflicting): Ecommerce pack €69/month + €90 registration; Marketplace pack €99/month + €90 registration ([dodropshipping 2026](https://dodropshipping.com/bigbuy-pricing-plans/)). Older figures: €89/month with €89 joining ([dropship.it 2024](https://dropship.it/article/bigbuy-dropshipping-review/)), "Dropship pack 120€/month" ([copyfy](https://www.copyfy.io/en/blog/bigbuy-review)). Connectors cost about €129–149 if not included. **ANNOUNCED**, check the live pricing page.
- API: Bearer-token auth, key issued via a contact form. Production at `https://api.bigbuy.eu`, sandbox at `https://api.sandbox.bigbuy.eu`, reference at `api.bigbuy.eu/rest/doc`. Catalogue covers products, taxonomies, manufacturers, attributes, images, variations and stock. **CONFIRMED** — [BigBuy API guide (PDF)](https://www.bigbuy.eu/public/doc/Guia_API_BigBuy_EN.pdf)
- Rate limits are not given in snippets ("certain policies may apply"). — [BigBuy API page](https://www.bigbuy.eu/it/api_bigbuy.html)

**Syncee (HU, marketplace of suppliers)**
- Suppliers join free (no commission, no setup fee). Retailers pay monthly or annual plans. **CONFIRMED** — [Syncee FAQ](https://syncee.com/faq)
- "12,000+ vetted US, EU, UK, and AU suppliers" and "6 million+ products". **ANNOUNCED** (third party and marketing) — [Ecommerce Paradise 2026](https://ecommerceparadise.com/syncee-review-2026/)
- Retailer plans conflict across sources: e.g. Free / $29 / $49 / $99 ([Ecommerce Paradise](https://ecommerceparadise.com/syncee-review-2026/)), Free / $40 / $60 / $100 / Plus $299 ([dodropshipping](https://dodropshipping.com/syncee-pricing-plans/)), Free / $39.99 / $59.99 / $99.99 with 0% transaction fees ([Avada](https://avada.io/blog/syncee-dropshipping/)). **ANNOUNCED**, check the live pricing page.
- API: help center says API/SOAP connections are not self-serve; "contact our support staff". The DataFeed Manager (CSV/XML/XLSX/JSON imports) is limited to Shopify, ShopRenter and Jumpseller stores. Product export to CSV can be scheduled. **CONFIRMED** — [Syncee DataFeed Manager](https://help.syncee.com/en/articles/3971222-what-is-the-syncee-datafeed-manager); [Syncee product export](https://help.syncee.com/en/articles/4201300-product-export-how-to-make-a-product-export-task); [import via DataFeed](https://help.syncee.com/en/articles/8957806-how-to-import-products-by-using-the-syncee-datafeed-manager)

**Flxpoint (US, multi-supplier ops platform, software not a supplier)**
- Business plan $799/month ($699 annual): 8 source and 2 channel connectors, 3,000 orders/month, 500,000 SKUs, EDI and API access. Enterprise has no public price (25 sources, 1M SKUs). **CONFIRMED** — [Flxpoint pricing](https://flxpoint.com/pricing). A third-party listing shows different tiers ($399–$2,000+) — [Software Finder](https://softwarefinder.com/ecommerce-software/flxpoint)
- API v1: inventory and pricing endpoint, max 500 records per request and 2 MB payload. — [Flxpoint API (Apiary)](https://flxpoint.docs.apiary.io/)
- Connects supplier APIs with **your own credentials** with each distributor. — [Flxpoint sources help](https://help.flxpoint.com/kb/sources-suppliers)

**Inventory Source (US)**
- Pricing page could not be fetched and search gave no figures. Not verified.

**Brandsdistribution (IT)**
- Web services are for authenticated dropshippers only. Stock and price files are refreshed every 15 minutes (full) and 4 minutes (incremental). **CONFIRMED** — [Brandsdistribution developers](https://www.brandsdistribution.com/en/cms/developers)
- €49/month (100 products) or €99/month (unlimited) on the current page. An older support article shows €69 / €99 +VAT. **CONFIRMED but inconsistent** — [monthly pricing](https://www.brandsdistribution.com/en/cms/fashion-dropshipping-pricing-monthly); [support article](https://support.brandsdistribution.com/en-us/article/69-how-much-does-brandsdistribution-s-dropshipping-service-cost)
- Catalogue is designer fashion and accessories, so it is **irrelevant for electronics**. — [Brandsdistribution pricing](https://www.brandsdistribution.com/en/cms/fashion-dropshipping-pricing)

**VidaXL (NL)**
- CSV/XML feed per destination country. Seller guides give stock updates "daily" or "hourly" (versions differ) and daily price updates. Price 0.00 means removed; stock 0 with a price means it will return. API covers order creation and status/tracking. An older FAQ gives a €30/month all-inclusive fee. **CONFIRMED (dated docs)** — [VidaXL dropshipper guide PDF](https://www.dropshippingxl.com/on/demandware.static/-/Library-Sites-vidaXLSharedLibrary/default/B2B_documents/seller_guide/EN.pdf); [VidaXL dropshipping FAQ](https://dropshipping.vidaxl.com/dropshipping-faqs/)
- Catalogue is mainly furniture, home and garden, so **not relevant for phones or IT** (HYPOTHESIS, based on the brand's known positioning; not verified in these snippets).

**Spocket / Wholesale2B**
- Spocket: "over 80% of suppliers ... in the EU and US". Plans about $39.99–$99.99 (or $40–$299) per month, conflicting. **ANNOUNCED** — [dodropshipping Spocket](https://dodropshipping.com/spocket-review/); [Ecommerce Paradise Spocket](https://ecommerceparadise.com/spocket-review-2026-the-best-us-and-eu-dropshipping-platform-for-fast-shipping-stores/)
- Wholesale2B: "Download Product Data" plan at $99.99/month gives CSV/XML/API feeds. 3% processing fee on automated orders. Ships US and Canada. **ANNOUNCED** (competitor's blog) — [Spocket's Wholesale2B review](https://www.spocket.co/blogs/wholesale2b-review); [Findstack](https://findstack.com/compare/spocket-vs-wholesale-2b)

**Ankorstore (FR)**
- Only third-party info: REST JSON API with a bearer key from the **brand** dashboard (i.e. brand-side). Minimum first order €300 in a 2020 article (likely outdated). No electronics evidence. — [ECOSIRE Odoo connector](https://ecosire.com/fr/products/ankorstore-store-management); [Springwise 2020](https://www.springwise.com/innovation/retail/ankorstore-marketplace-independent-shops)

### Inferences
- **HYPOTHESIS:** Dropshipping aggregators sell consumer gadgets and accessories, not graded refurbished iPhones or Apple parts. Their electronics prices are dropship prices (retail-minus), not true wholesale. They are a weak fit for MON STOCK's core categories.
- **HYPOTHESIS:** Flxpoint and Inventory Source are *integration software*. They do not give access to suppliers; you bring your own supplier accounts. They solve the "many feeds" plumbing problem, but MON STOCK already has its own adapter layer, so this is redundant and expensive ($699+/month).
- **HYPOTHESIS:** Keeping BigBuy as an adapter is reasonable for new accessories and electronics, but it does not cover refurbished phones or parts.

### Gaps
- Exact BigBuy electronics or smartphone SKU count, and whether Apple products are in stock: not found.
- Syncee API terms (storage, sync frequency) and electronics share among its suppliers: à confirmer auprès du fournisseur.
- Inventory Source supplier list and prices: not verified (fetch blocked).
- Dropshipzone (AU), EuroDropshipping, Wholesale Central, Faire, Tradeling: not searched.

## Q4. IT distribution price/stock aggregators (best fit for "one platform, many suppliers, real pro prices and stock via API")

### Takeaway
**ITscope** (DE) is the strongest match to the stated goal for the IT and electronics part. It compares price and stock lists from 300–400+ European IT distributors. It has an official API (paid add-on) and shows **each reseller's own negotiated distributor prices**. It does not cover lots, pallets or refurbished phones, and France-specific distributor coverage is unconfirmed.

### Cited Findings
- ITscope "compare over 350 distributors across Europe". The manufacturer page says ">300 distributors". The API guide says "over 3 Million products and over 400 suppliers". EDI ordering works with ">80 distributors using just one interface". **ANNOUNCED** (vendor figures, inconsistent by page and date) — [ITscope home](https://www.itscope.com/en/); [ITscope for manufacturers](https://www.itscope.com/en/itscope-for-manufacturers/); [ITscope Guide](https://guide.itscope.com/en/)
- Price and stock: where a distributor has an interface, prices are pulled live. Otherwise lists sync several times an hour. **ANNOUNCED** — [ITscope IT procurement](https://www.itscope.com/en/solutions/it-procurement/)
- API provides product, price and trading data, cart optimisation, and quote/order import. A documented method exists (e.g. business/deals/send). **CONFIRMED** — [ITscope Guide](https://guide.itscope.com/en/); [business/deals/send](https://guide.itscope.com/en/kb/business-deals-send-method/)
- Packages (billed yearly): Essential €51/month, Essential+ €72, ERP Integration €189, B2B Commerce €369. Extra users from €20. A German draft page shows €49 / €69 / €179 / €349. **CONFIRMED (official page), minor inconsistency** — [ITscope pricing](https://www.itscope.com/en/pricing/); [pricing draft](https://www.itscope.com/en/pricing-entwurf/)
- API add-on "Individual API": €104/month for up to 5,000 API calls per month, with higher volumes on request. **CONFIRMED** — [ITscope Individual API](https://www.itscope.com/en/solutions/itscope-erp-integration/individual-api/); [ERP integration](https://www.itscope.com/en/solutions/itscope-erp-integration/)
- Distributors list themselves on ITscope (distributor-side offering). — [Listing on ITscope](https://www.itscope.com/en/solutions/listing-on-itscope/)
- Individual distributor APIs also exist but require account approval. TD SYNNEX: "gain approval from your TD Synnex representative". It has a Price & Availability API and an EU reseller product endpoint with a flag to exclude out-of-stock items. One integrator notes distributor APIs "do not work all the time", so price files are a fallback. — [TD SYNNEX developer portal](https://developer.tdsynnex.com/); [TD SYNNEX EU reseller products](https://developer.api.tdsynnex.com/eu/reseller/post-products); [CloudRadial guide](https://support.cloudradial.com/hc/en-us/articles/30968227620756-Connecting-TD-Synnex-to-Storefront); [D-Tools](https://docs.d-tools.cloud/en/articles/8901451-connecting-to-td-synnex-pricing)

### Inferences
- **HYPOTHESIS:** ITscope's model (you link *your own* distributor accounts, then see your own prices and live stock through one API) directly answers "real pro purchase prices, per-account pricing, stock, EAN" for new IT, Apple-distributed products and accessories. Price at the minimum useful tier is roughly €51 + €104 = about €155/month (annual billing), à confirmer.
- **HYPOTHESIS:** Value for a small French reseller depends on (a) which French distributors (Ingram Micro FR, TD SYNNEX FR, Also, Esprinet, Exertis…) are connected, and (b) whether those distributors open accounts to a micro-business. Both are à confirmer auprès du fournisseur.
- **HYPOTHESIS:** ITscope does not cover refurbished or graded phones, Apple spare parts, or liquidation lots, so it can only replace part of the sourcing scope.

### Gaps
- List of ITscope-connected distributors in France and ITscope ToS on data storage and redistribution: not found.
- Ingram Micro Xvantage and Esprinet reseller API conditions for France: no results.
- Whether ITscope requires a registered IT reseller (Kbis, VAT, distributor accounts) to subscribe: not found.

## Q5. China-side sourcing platforms (AliExpress, Alibaba.com, DHgate, Global Sources, Made-in-China)

### Takeaway
AliExpress has an official Open Platform (dropshipping and affiliate APIs). It requires signing an Open Platform agreement, and the affiliate API covers only affiliate-catalogue products. No buyer-side Alibaba.com (ICBU) API was found. These platforms do not give EU wholesale stock, grades or VAT-compliant supply for refurbished Apple devices.

### Cited Findings
- AliExpress services moved from the legacy Taobao Open Platform to the AliExpress Open Platform for International Developers. The SDK covers product details, orders and shipping calculation for dropshipping. **CONFIRMED via open-source SDK** — [ae_sdk on GitHub](https://github.com/moh3a/ae_sdk)
- You must read and sign the Open Platform Agreement in the developer console. — [Elfsight guide 2026](https://elfsight.com/blog/how-to-get-and-use-aliexpress-api-key/)
- Affiliate API needs approval and covers only affiliate-catalogue products. **ANNOUNCED** (secondary, a scraping vendor) — [The Mine Works](https://themineworks.com/blog/aliexpress-product-scraper-api/)
- Many third-party scrapers (Apify, RapidAPI) are advertised. Their compliance with AliExpress terms is doubtful. — [Apify AliExpress scraper](https://apify.com/cloud9_ai/aliexpress-scraper/api/openapi)

### Inferences
- **HYPOTHESIS:** Out of scope for MON STOCK's core (refurbished iPhone/Mac, EU VAT, grades). At most a source for generic accessories and parts, and the storage rights for price data are à confirmer in the Open Platform agreement.

### Gaps
- Alibaba.com ICBU buyer API, DHgate API, Global Sources and Made-in-China feeds: no results found. Status unknown.
- AliExpress Open Platform clauses on caching and storing price data: not found in public snippets.

## Q6. Cross-cutting: ToS and automation rights, manifests, "one platform" answer

### Takeaway
No single platform found gives many suppliers' catalogues with real wholesale price and stock by API across **all** of MON STOCK's categories. The best partial answers are: ITscope for new IT and electronics (per-account distributor prices, official API), Merkandi for EU stocklots and graded phones (directory, no buyer API, needs written permission), and Callisto for graded used phones (structured marketplace, no public API). Liquidation majors forbid automation.

### Cited Findings
- Explicit anti-automation clauses: B-Stock ([ToS](https://bstock.com/terms-of-use/)) and Liquidity Services ([User Agreement](https://liquidityservices.com/user-agreement)).
- Official, sanctioned data access: BigBuy API ([guide](https://www.bigbuy.eu/public/doc/Guia_API_BigBuy_EN.pdf)), ITscope API add-on ([page](https://www.itscope.com/en/solutions/itscope-erp-integration/individual-api/)), Brandsdistribution files every 4–15 min ([developers](https://www.brandsdistribution.com/en/cms/developers)), VidaXL feed ([guide](https://www.dropshippingxl.com/on/demandware.static/-/Library-Sites-vidaXLSharedLibrary/default/B2B_documents/seller_guide/EN.pdf)), Flxpoint API ([Apiary](https://flxpoint.docs.apiary.io/)). Syncee API needs support contact ([help](https://help.syncee.com/en/articles/3971222-what-is-the-syncee-datafeed-manager)).
- Manifest quality for lots: Jobalots lists a manifest but sells returns unchecked, with complaints of missing items ([Jobalots](https://jobalots.com/en), [Trustpilot](https://www.trustpilot.com/review/jobalots.com)). FR pallet sellers often provide no item-level manifest ([Easy Destocks](https://easydestock.com/a-propos), [wholesaleclearancepallets.fr](https://wholesaleclearancepallets.fr/product/amazon-warehouse-clearance-pallets-france/)). Callisto offers per-listing standardised grades including W = mixed-grade lot ([Callisto grading](https://callisto.tech/blog/how-grading-works-for-wholesale-smartphones-laptops-and-tablets)).

### Inferences
- **HYPOTHESIS, ranked for MON STOCK:**
  1. **ITscope.** Only true "many suppliers, per-account real prices, live stock, official API" platform found. Fits IT and new electronics. Confidence medium (vendor claims; FR coverage unverified).
  2. **Merkandi.** Broadest EU stocklot and graded-phone supplier pool, but inquiry-based. Use only with written consent for automation, or via manual or CSV import. Confidence medium-low for automation.
  3. **Callisto.** Best data structure for graded used phones. API status unknown. Contact them.
  4. **BigBuy.** Keep the existing adapter; it is single-supplier.
  - Exclude for automation: B-Stock, Amazon EU liquidations (via B-Stock), Liquidation.com/Liquidity Services. Exclude for category fit: Brandsdistribution, VidaXL, Wholesale2B (US), Ankorstore (no electronics evidence).
- **HYPOTHESIS:** Return-pallet manifests are rarely itemised with condition, so automatic resale valuation of lots should be treated as an estimate with a confidence flag, not a price.

### Gaps
- Written ToS clauses on storing and syncing data for Merkandi, Callisto, ITscope and Syncee: not found publicly. Ask each supplier (à confirmer auprès du fournisseur).
- All findings come from search snippets because page fetches were blocked. Re-verify the live pricing pages (BigBuy, Syncee, Merkandi, ITscope) before quoting them in the final report.
