# B2B trading platforms and wholesale marketplaces for refurbished, used and new smartphones (iPhone), tablets and MacBooks: API or stock feed for a small French reseller

> **Method and limits (read first).** Research done on 2026-10-15. Direct page fetching was **not possible** from this environment: WebFetch returned `getaddrinfo ENOTFOUND` for gsmexchange.com, callisto.tech, sellify.market and b2bheadlines.com, and curl got `CONNECT tunnel failed, response 403` from the proxy for gsmexchange.com, callisto.tech, foxway.com and kardz.com. Every finding below therefore comes from **search-engine extracts of the cited pages** (mostly official pages), not from a full reading of each page. Treat exact wording and figures as "to re-check on the live page". No account was created and no login wall was bypassed.
> Status labels: **CONFIRMED** = stated on the vendor's own page (seen through a search extract). **ANNOUNCED** = a vendor marketing claim, or something only a third party states. **HYPOTHESIS** = my own inference. "À confirmer auprès du fournisseur" = not public.

## Q1. gsmExchange (gsmexchange.com) and TradeTrust by gsmExchange: what is it, how does it work, and is there an API?

### Takeaway
gsmExchange is the closest match to "one platform with many wholesale sellers": a Dublin-based, vetted, real-time B2B trading floor for handsets and tablets, paid through membership plus transaction fees. I found **no public API or stock-feed documentation**, and the entry bar (two trade references and a minimum trading volume) is a real hurdle for a very small reseller. Its sister site TradeTrust is a more open marketplace for refurbished goods with an escrow-style flow.

### Cited Findings
- **Function (CONFIRMED):** a real-time e-marketplace ("Trading Floor") for handsets, tablets and accessories. Traders post stock or list requirements (WTS/WTB), published inventory is "live and is updated/distributed in real time", and a matching engine connects deals on stock specifications. — [gsmExchange Services](https://www.gsmexchange.com/en/services); [About](https://www.gsmexchange.com/en/about)
- **Scale (ANNOUNCED, dated):** a trade-press interview quotes the CEO saying about €1M of stock is offered for trading every hour. The article is several years old. — [Mobile News: "Grey matters work for gsmExchange"](https://mobilenewscwp.co.uk/features/article/grey-matters-work-for-gsmexchange/)
- **Vetting (CONFIRMED):** applicants must give **two trading references from wholesale mobile phone companies** and **meet minimum trading volume requirements**. An account manager calls to validate the application and the references are contacted. Members can see trading history and background information on every company. — [gsmExchange Terms](https://www.gsmexchange.com/en/terms); [Services](https://www.gsmexchange.com/en/services)
- **Fees (CONFIRMED in principle, no figures):** "all transactions conducted on the Trading Floor are subject to fees imposed by gsmExchange.com", deducted from the sale proceeds. Per-transaction fees appear in the seller's account before a sale is finalised. Revenue also comes from membership fees and advertising. **No public membership price was found.** — [gsmExchange Terms](https://www.gsmexchange.com/en/terms)
- **Premium tier (CONFIRMED that it exists):** premium members get account-manager support for questions about other companies. A 2009 newsletter says posting used/refurbished lots went through a noticeboard open to premium members (dated). — [Services](https://www.gsmexchange.com/en/services); [Distributor updates (old)](http://www.gsmexchange.com/news/distributors/index.html)
- **Market data (ANNOUNCED):** "gsmX PriceWatch" is a paid market-intelligence report on handset pricing trends, not a stock watch list. — [Serchen listing](https://www.serchen.com/company/gsmexchange-com); [Services](https://www.gsmexchange.com/en/services)
- **Company size (third-party estimates):** about $2.7M ARR (Latka estimate). Other aggregators give figures up to about $5.6M. Reliability is low. — [GetLatka](https://getlatka.com/companies/gsmexchangecom); [Crunchbase](https://www.crunchbase.com/organization/gsmexchange-com); [Dealroom](https://app.dealroom.co/companies/gsmexchange_com)
- **TradeTrust by gsmExchange (CONFIRMED that it exists):** a Dublin-based marketplace for new, refurbished and used phones and electronics. It says it "selects the most reliable sellers across Europe and worldwide" and has 11–50 employees. Its product pages show grades such as "ROP Grade A" and "CPO" without public definitions. — [LinkedIn TradeTrust](https://ie.linkedin.com/company/tradetrust); [tradetrust.com category page](https://tradetrust.com/other/watches)
- **Escrow (ANNOUNCED, link unclear):** tradetrustservice.com, which says it is supported by gsmExchange, describes a six-step flow. The buyer submits ID and pays into an independent account, the seller ships, the buyer confirms receipt, and the funds are then released. It is unclear whether this covers tradetrust.com orders. — [Trade-Trust service](http://www.tradetrustservice.com/)
- **Reviews:** Trustpilot "TradeTrust by gsmExchange.com" shows a TrustScore of about 4.5/5 from about 29 reviews, mostly 5★, with no reviews in the last 12 months. Scamadviser rates gsmexchange.com "very likely not a scam" (automated score; domain about 27 years old). Glassdoor employee reviews are negative, but they are about employment, not trading. No Reddit threads were found. — [Trustpilot](https://ie.trustpilot.com/review/tradetrust.com); [Scamadviser](https://www.scamadviser.com/check-website/gsmexchange.com); [Glassdoor](https://www.glassdoor.co.uk/Reviews/gsmExchange-com-Reviews-E1103503.htm)
- **API:** no public developer documentation, API or feed was found in any search. — (absence across several searches; see Gaps)

### Inferences
- HYPOTHESIS: on the gsmExchange trading floor, prices are real professional prices (WTS offers between traders), often in USD/EUR. Grades are free-text per offer ("A/B", "ASIS", "CPO"), so they would need normalising, much like Refreshed Apples NL's "A/B".
- HYPOTHESIS: a micro-reseller with no references from other wholesalers and low volume would probably be **refused, or limited to a basic tier**. TradeTrust looks more accessible but is a single storefront of selected sellers rather than an open trading floor.
- HYPOTHESIS: with no API and an internal-use framing in the ToS, any automated collection would need gsmExchange's written permission.

### Gaps
- Membership price, tiers and MOQ: not public. À confirmer auprès du fournisseur.
- API, CSV or e-mail stocklist export, storage rights, sync frequency and scraping clauses: the full ToS could not be read (fetch blocked). Re-read https://www.gsmexchange.com/en/terms for clauses on copying and automated access.
- Current member count: only a 2009 figure exists (outdated, not reported).
- VAT margin scheme support, IMEI lists and battery health per offer: not found.

## Q2. Foxway (Reseller Store, Wholesale Platform, auctions): single wholesaler, stock feed, API?

### Takeaway
Foxway is a **single large wholesaler** (Nordic, about 1.5M devices a year), not a multi-seller marketplace. It runs a real-time B2B reseller store, take-all batches and weekly auctions, with Excel stock lists and a "customized API" offered on request. Of the candidates, it is the most realistic **official feed** source for phones, tablets and laptops in the EU.

### Cited Findings
- **Company (ANNOUNCED or third party):** formerly Xllnc AB, owned by Nordic Capital and Norvestor, handles over 1.5M devices a year. Its main customers are large organisations, OEMs, MNOs and retailers. — [PitchBook](https://pitchbook.com/profiles/company/338513-32); [CB Insights](https://www.cbinsights.com/compare/refurb-vs-xllnc)
- **Reseller Store (CONFIRMED):** a B2B access point for buying second-hand electronics in bulk (smartphones, tablets, wearables, laptops). It claims "more than 1000 trusted B2B resellers across Europe"; other Foxway pages say about 800. — [resellers.foxway.com](https://resellers.foxway.com/); [Why Foxway?](https://resellers.foxway.com/why-foxway/); [Used mobile phones](https://resellers.foxway.com/used-mobile-phones/)
- **Grades and quality (CONFIRMED):** each device is tested and graded individually. Categories are brand new, 14-day returns, used, refurbished, and devices for refurbishing. A grading guide exists. Foxway gives a 90-day warranty including cosmetics and claims a return rate below 2%. — [Used mobile phones](https://resellers.foxway.com/used-mobile-phones/); [Why Foxway?](https://resellers.foxway.com/why-foxway/)
- **Stock and MOQ (CONFIRMED):** a real-time stocklist. Minimum order is about **€2,000** (laptop page and Swedish phone page; check per category). — [Used computers & laptops](https://resellers.foxway.com/used-computers-and-laptops/); [Begagnade mobiltelefoner](https://resellers.foxway.com/begagnade-mobiltelefoner/)
- **Wholesale Platform (CONFIRMED):** most deals are **take-all**, meaning you buy the whole spreadsheet at the advertised average unit price. Some same-spec kit has a minimum quantity, "often 50 units". If the Excel list carries no grade, expect about 80% A/B and 20% C. Payment is in GBP, EUR or USD by bank transfer, card or PayPal; bank charges are paid by the buyer. Prices are **ex VAT and Ex Works**. — [Wholesale FAQ](https://wholesale.foxway.com/faqs); [Sales terms](https://wholesale.foxway.com/sales-terms); [Payment details](https://foxway.zendesk.com/hc/en-us/articles/22467865758865-Payment-details)
- **Auctions (CONFIRMED):** new batches every week, Tuesday to Thursday. Auction orders are sold under the **reverse-charge VAT scheme**, with shipping added to the batch price. — [auction.foxway.shop](https://auction.foxway.shop/); [Live auctions](https://resellers.foxway.com/knowledge/live-auctions/)
- **API / feed:** the "Why Foxway?" page carries a "Need a customized API?" prompt (CONFIRMED that it is offered). A third-party Magento connector vendor says Foxway supplies feeds by API, JSON/XML or FTP/SFTP for stock and prices (ANNOUNCED by a third party). — [Why Foxway?](https://resellers.foxway.com/why-foxway/); [AALOGICS Foxway–Magento guide](https://www.aalogics.com/magento-2-product-import-guide-integrating-foxway-magento-2-using-aalogics-supplier-feed-extension)
- **Distributor listing:** Stock in the Channel lists "Foxway (FKA DCC)" with the claim "all listed items are in stock". — [Stock in the Channel](https://dk.stockinthechannel.com/Distributor/Foxway-FKA-DCC-/16)

### Inferences
- HYPOTHESIS: the API or Excel feed would give **per-account B2B prices** for one seller only. That fits MON STOCK's existing supplier-connector model (like Refreshed Apples) better than a marketplace adapter.
- HYPOTHESIS: reverse-charge EU sales suit a French VAT-registered company buying under the normal VAT scheme. Whether **margin-scheme** stock (TVA sur marge) is offered is unknown.
- HYPOTHESIS: a €2,000 MOQ and take-all batches are reachable for a small reseller on auctions or stocklist orders, but take-all batches carry mixed-grade risk.

### Gaps
- API documentation, authentication, fields (IMEI, battery health, capacity, colour) and allowed sync frequency: not public. À confirmer auprès du fournisseur.
- Account approval criteria (Kbis, VAT number): not found.
- Whether API data may be stored or used in third-party software: not found.

## Q3. Callisto (callisto.tech): a multi-seller B2B marketplace with escrow?

### Takeaway
Callisto is a **real multi-seller B2B marketplace** for used, refurbished and damaged electronics. It sells through catalogue listings, offers and weekly auctions, with KYC, escrow and no sign-up fee for buyers. It looks accessible to a small EU business with a VAT number, but **no public API** was found.

### Cited Findings
- **Model (CONFIRMED):** a global B2B used-electronics marketplace. Sellers choose Auction, Catalogue or Offers. There are weekly live and silent auctions managed by a vendor manager, and a seller dashboard with target prices. — [callisto.tech](https://callisto.tech/); [How it works](https://callisto.tech/how-it-works); [Tech auctions blog](https://callisto.tech/blog/tech-auctions.-a-smarter-way-to-source-used-wholesale-smartphones)
- **Reach (ANNOUNCED, inconsistent):** "2,500+ registered wholesalers and resellers" in 50+ countries on one page, "3,500+ wholesale buyers" on another. — [Wholesale used smartphones](https://callisto.tech/wholesale-used-smartphones-on-callisto); [Become a seller](https://callisto.tech/blog/expand-your-business-reach-become-a-seller-on-callisto)
- **Registration (CONFIRMED):** you enter company details, then the account is "Under Review" while the KYC team checks it. Required items are the **company registration number, tax number, VAT number** and billing and shipping addresses, plus extra documents in some regions and 2FA. — [How to register your business](https://callisto.tech/knowledge-centre/en/how-to-register-your-business-on-callisto)
- **Fees (CONFIRMED partially):** buyers have "no sign-up fees"; sellers have "no sign-up fee or listing fees". **Commission rates are not published.** — [For buyers](https://callisto.tech/for-buyers); [For sellers](https://callisto.tech/for-sellers)
- **Escrow (CONFIRMED):** funds are held in escrow and released to the seller once the buyer confirms the goods arrived in the promised condition. — [How to buy with confidence](https://callisto.tech/blog/how-to-buy-wholesale-used-electronics-with-confidence)
- **Product scope (CONFIRMED):** used, refurbished, returned, off-lease and warranty-returned products, plus accessories. — [For buyers](https://callisto.tech/for-buyers); [Wholesale tech accessories](https://callisto.tech/wholesale-tech-accessories-callisto)

### Inferences
- HYPOTHESIS: of the multi-seller platforms found, Callisto has the most **accessible** onboarding for a French SAS/SARL/micro-enterprise with a VAT number.
- HYPOTHESIS: without an API, integration with MON STOCK would be manual (exporting offers, if Callisto allows it), unless Callisto agrees to a feed.

### Gaps
- API, stock export, ToS clauses on scraping or automation, buyer commission, currencies, VAT margin-scheme handling, and IMEI/battery data per lot: not found. À confirmer auprès du fournisseur.
- No independent user reviews were found.

## Q4. Merkandi (merkandi.com): multi-seller wholesale and liquidation marketplace with a paid subscription

### Takeaway
Merkandi is an open EU wholesale classifieds marketplace (lots, returns, used and refurbished iPhones graded A/B, including margin-scheme stock). It has **public annual membership prices** (about €191–€279/year), but contact details are paywalled and I found **no API or ToS** on automated use.

### Cited Findings
- **Membership (CONFIRMED on the registration page):** Standard plan listed at **€239/year** (shown with a 20% discount at €191.20); Premium at **€279/year** (€223.20 discounted). Instalments are possible via PayPal or Klarna, and "85% choose Standard". The page is framed around seller registration, so the buyer plan needs checking. — [Merkandi register](https://merkandi.com/register)
- **Paywall (CONFIRMED):** seller contacts and full offer details need a paid subscription, and there are no test accounts for buyers. — [Merkandi register](https://merkandi.com/register)
- **Stock (CONFIRMED that such listings exist):** used and refurbished iPhones graded A/B, mixed brand lots, EU-spec units with **VAT margin-scheme** pricing, pallet lots, and damaged lots. Prices are in EUR (.com) or USD (.us). — [Merkandi smartphones category](https://merkandi.com/categories/smartphones-mobile-phones/87); [Refurbished iPhones wholesale (.us)](https://merkandi.us/wholesale/refurbished-iphones); [Refurbished phones](https://merkandi.com/ware/refurbished/phones-mobile-phones)

### Inferences
- HYPOTHESIS: deals are concluded **directly between buyer and seller**, with no platform escrow found. Fraud risk therefore sits with the buyer, which is typical of classifieds marketplaces.
- HYPOTHESIS: the low cost makes Merkandi easy for a micro-reseller to join, but data quality (grades, capacity, quantities) will vary by seller.

### Gaps
- API, export, ToS on automated collection and storage: not found (search returned unrelated pages). À confirmer auprès du fournisseur.
- Escrow or buyer protection: not found.

## Q5. GSM-B2B (gsm-b2b.com) and similar WTS/WTB trading networks

### Takeaway
GSM-B2B is a long-running WTS/WTB trading network for mobile traders (about 5,000+ verified members and about 10,000 daily offers, per its own site), run by Globo Service GmbH. Pricing and API are not public, so it is similar to gsmExchange but less documented.

### Cited Findings
- **Function and scale (ANNOUNCED):** "over 5,000 verified members", "over 10,000 fresh selling offers (WTS) and buying requests (WTB) updated daily", and "over 500,000 telephones, accessories and game consoles" traded. — [gsm-b2b.com](https://gsm-b2b.com/); [About](https://gsm-b2b.com/about)
- **Operator (ANNOUNCED, app listing):** the iOS app developer is Globo Service GmbH. — [Soft112 app listing](https://gsm-b2b-trading-platform-ios.soft112.com/)
- **Membership:** a directory says membership gives access to "more than 6,000 offers and requests", but no price is given and the directory has conflicting dates (unreliable). — [ExportHub](https://www.exporthub.com/gsm-b2b/)
- **Lookalike:** gsmworld-b2b.com puts stock prices behind a login and shows a sample "iPhone 13 – $260". Its relation to GSM-B2B is unconfirmed. — [GsmWorld-b2b](https://www.gsmworld-b2b.com/)
- **Other networks found but not checked:** gsmfeed ("157,000+ companies"). — [gsmfeed](https://gsmfeed.com/)

### Inferences
- HYPOTHESIS: in these WTS/WTB networks, offers are free text with grey-market stock and no escrow. They are useful for leads, but hard to normalise automatically and carry a higher fraud risk.

### Gaps
- Fees, API, ToS and escrow: not found. À confirmer auprès du fournisseur.

## Q6. Assurant / HYLA ASP (Advanced Sales Platform): direct trade-in supply by auction

### Takeaway
Assurant (which bought HYLA in 2020) sells carrier, retailer and OEM trade-in devices to approved buyers through its ASP, by open or sealed auctions and stocklists. Devices are sold **as-is** and grades can change without notice. It is a **single-source** channel, US-centric in the evidence found.

### Cited Findings
- **Acquisition (CONFIRMED):** Assurant acquired HYLA Mobile in 2020, which doubled device-processing volumes. — [Business Wire](https://www.businesswire.com/news/home/20201028005610/en/Assurant-Acquires-Mobile-Device-Trade-In-Innovator-HYLA-Mobile)
- **Buyer access (CONFIRMED):** new buyers apply online on the "Become a Buyer" page. — [Become a Buyer](https://hylaasp.hylamobile.com/become-a-buyer/)
- **Supply and grading (CONFIRMED):** stock comes from carriers, retailers and OEMs (trade-in, buyback, remorse returns), with automated grading and random post-inspection checks. — [Hyla ASP home](https://hylaasp.hylamobile.com/)
- **Mechanics (CONFIRMED):** the FAQ covers "Open" and "Sealed" auctions, reserve pricing and stocklist pricing. The terms say bids go through the "Liquidation Auction and/or Supplier's bid sheet", products are sold "As-Is", and the supplier may change grades and availability. — [ASP FAQ](https://hyla.zendesk.com/hc/en-us/categories/360004094751-Assurant-ASP-FAQ); [ASP Platform terms](https://www.assurant.com/asp-authorized-resellers)

### Inferences
- HYPOTHESIS: volumes, USD pricing and US logistics make this unlikely to suit a French micro-reseller. Re-check whether an EU lot channel exists.

### Gaps
- EU availability, MOQ, API or bid-sheet export, and approval criteria: not found. À confirmer auprès du fournisseur.

## Q7. Brightstar / Likewize, Recommerce, Back Market, Refurbed and Swappie: do they offer a B2B buying channel for resellers?

### Takeaway
None of these has a **public self-serve B2B buying portal with an API** for small resellers. Back Market and Refurbed are consumer marketplaces (MON STOCK would be a seller there, not a buyer). Swappie's B2B site covers refurbishing and buyback services. Recommerce sells to large distributors and operators.

### Cited Findings
- **Back Market:** only verified professional refurbishers may sell, and "commerçants et grossistes" are listed among seller types. One third-party source says only about a third of applicants are accepted. Commission is about 10–12% per sale (third-party estimates). No bulk-buyer or pro-buying programme was found. — [Back Market: Who sells](https://www.backmarket.fr/fr-fr/c/news/who-sells-on-back-market); [refurb.me guide](https://www.refurb.me/fr/blog/back-market-avis-fiable-guide-achat); [Sacra](https://sacra.com/chat/h/402b2674-d5bf-4318-ab7d-4d5727c49fe5/)
- **Grade warning (opinion, seller blog):** a "grade B wholesale" lot does not map automatically onto Back Market grades. The blog cites a possible 40% "Fair" and 30% unsellable without checking a sample. — [Margeo blog 2026](https://margeoapp.com/blog/vendre-sur-back-market-reconditionneur-2026)
- **Refurbed:** a European consumer marketplace (third-party profile). No wholesale or B2B buying programme was found. — [Extruct profile](https://www.extruct.ai/hub/refurbed-com/)
- **Swappie (CONFIRMED):** business.swappie.com offers refurbishing, trade-in and buyback services to marketplaces, leasing companies and telcos ("quotes for bulk or unit-by-unit buyback, built on over 3 million transactions"). Selling wholesale stock to resellers is not documented. — [Swappie B2B services](https://business.swappie.com/services/)
- **Recommerce (CONFIRMED):** sells refurbished smartphones to "distributeurs, opérateurs, assureurs et grossistes européens" (FR, CH, BE, DE, NL, Iberia), with a 24-month warranty. Its trade-in API is white-label for B2C and B2B, but that is **buyback, not a stock feed**. It also has a merchant programme (CircularX). — [Recommerce produits reconditionnés](https://www.recommerce-solutions.com/produits-mobiles-reconditionnes/); [Recommerce buyback](https://recommerce-solutions.com/buyback-solutions/)
- **Brightstar:** acquired Next Wireless in 2018 for B2C used-device sales and claimed about 15M devices a year (2018 claim). No B2B buyer platform was found. — [CB Insights: Next Wireless](https://www.cbinsights.com/company/next-wireless-group)

### Inferences
- HYPOTHESIS: Recommerce might sell stock to a small French reseller only with sufficient volume. Contacting their sales team is the only route.

### Gaps
- Back Market Pro / Back Market Business: the B2B *purchasing* conditions for companies were not found. Recommerce and Swappie reseller MOQ and pricing: à confirmer auprès du fournisseur.
- Likewize (formerly Brightstar) B2B lot sales in the EU: not researched in depth.

## Q8. Other multi-seller or wholesaler candidates found (Sellify, Giggle Trade, HUBX, iOutlet Business, RecirQ, BidAllies, B2B Mobile, PJT/ATRenew, Global Sources)

### Takeaway
Several more platforms exist, but most are **single wholesalers** or US-focused, and **none published an API** in the results. Sellify (EU, verified traders) and Giggle Trade are worth a manual check. HUBX is the only "anonymous marketplace" model, but it covers new and factory-refurbished stock and is US-centric.

### Cited Findings
- **Sellify (ANNOUNCED):** "B2B wholesale phone trading platform" where you "buy and sell in bulk with verified traders across Europe and beyond", with graded used and refurbished phones and an instant buyback quote tool. — [sellify.market](https://www.sellify.market/)
- **Giggle Trade (ANNOUNCED):** "B2B platform for used & refurbished smartphones" with wholesale prices on iPhone and Samsung. — [giggletrade.com](https://giggletrade.com/)
- **Mobility Traders (ANNOUNCED):** B2B device trading and refurbishment. — [mobilitytraders.com](https://mobilitytraders.com/)
- **HUBX (ANNOUNCED):** "World's First Anonymous B2B Marketplace" (2019 PR: $200M revenue in its first year). Vendors must sell new, factory-refurbished or grade-A refurbished stock with an end-user warranty. Inventory "changes by the minute". HUBX takes title and handles logistics. No API documentation was found. — [PR Newswire](https://www.prnewswire.com/news-releases/hubx-the-worlds-first-anonymous-b2b-marketplace-platform-surpasses-200-million-in-revenue-in-first-year-hires-industry-veteran-as-chief-revenue-officer-300846615.html); [HUBX guest portal](https://hubx.com/guest/home)
- **iOutlet Business (UK, single wholesaler):** sends price sheets daily or on demand and sells on account terms. Grade A needs ≥85% battery health and grade B ≥80% (light scratches). — [business.theioutlet.com](https://business.theioutlet.com/)
- **HK Refurbished Stock (press release):** grade "A+++" iPhones, margin-VAT invoicing and "customs-free DHL" shipping to the EU. These are company claims only, and this is a fraud-sensitive profile. — [Press release](https://www.myknoxcountynews.com/online_features/press_releases/article_ee4e27b7-b575-5eff-8ab1-62ac07b6d787.html)
- **US wholesalers / marketplaces:** RecirQ (grades A/B/C, "every supplier vetted", no minimum), BidAllies (no minimum, US shipping), B2B Mobile (lots and pallets, IMEI-verified, live auctions), WeSellCellular, TG Wireless (members-only pricing), Nobility Wireless (10–10,000+ units, IMEI-verified). — [RecirQ](https://www.recirqglobal.com/buy-refurbished-phones-wholesale); [BidAllies](https://bidallies.com/); [B2B Mobile](https://gob2bmobile.com/); [WeSellCellular](https://www.wesellcellular.com/); [TG Wireless](https://tgwireless.com/); [Nobility Wireless](https://nobilitywireless.com/)
- **ATRenew / PJT Marketplace (China):** a B2B platform for second-hand electronics with price assessment. — [Wikipedia ATRenew](https://en.wikipedia.org/wiki/ATRenew)
- **Global Sources / TradeWheel:** directories of mostly Asian suppliers. One TradeWheel listing has a 500-unit MOQ. — [Global Sources](https://www.globalsources.com/category/refurbished-phones-manufacturer-supplier_51017/); [TradeWheel](https://www.tradewheel.com/mobile-phones/)
- **PhoneTrade (phonetrade.at):** an Austrian used-phone seller (wholesale and retail) with bulk discounts. No API was found. — search extract only (no primary URL returned); see also [Phones Trade Workspace app](https://workspace.google.com/marketplace/app/phones_trade/378282826271?hl=he), whose relation is unconfirmed.

### Inferences
- HYPOTHESIS: US sources add customs duties and import VAT, and they are not on the EU margin scheme. That likely wipes out the price advantage for a French reseller.

### Gaps
- Kardz: no B2B phone platform by this name was found (only an unrelated Google Play game-service app: [Kardz on Google Play](https://play.google.com/store/apps/details?id=com.kardz.overseas&hl=en_US)). Interdeal, Phonebid, "TheWholesaler", "Mobile Center wholesale API", Reebelo B2B, Tradeling, Liquiditystock: **no reliable results found**.
- SellCell: confirmed as a **consumer** price-comparison site for selling phones, not a B2B source. — [SellCell](https://www.sellcell.com/); [SellCell partners](https://www.sellcell.com/partners/)

## Q9. Generic marketplaces with an official API (eBay, Alibaba.com, Amazon Business) and B-Stock's terms

### Takeaway
eBay (already integrated through the Browse API) carries iPhone wholesale-lot categories, but they mix grades and parts-only lots. Alibaba.com has an Open Platform that needs approval and forbids systematic content retrieval without permission. B-Stock's ToS explicitly forbid bots, scrapers and data mining, which confirms MON STOCK's exclusion. Nothing was found on Amazon Business renewed bulk buying.

### Cited Findings
- **eBay lots (CONFIRMED that the categories exist):** "Wholesale Lots iPhone" category pages mix grade A-B, sealed, refurbished and parts-only ("ungraded") lots. — [eBay wholesale lots iPhone](https://www.ebay.com/b/Wholesale-Lots-iPhone-In-Cell-Phones-Smartphones/9355/bn_7022317217)
- **Alibaba.com Open Platform (third party, not verified on official docs):** you register as a developer, submit the app for review and request API permissions. A buyer-side endpoint `alibaba.procurement.supplier.items.get` is cited. The ToS reportedly prohibit "systematic retrieval of site content to compile a collection or database" without permission. — [Ecosire Odoo Alibaba docs](https://docs.ecosire.com/odoo-modules/alibaba); [Aliyun developer article (CN)](https://developer.aliyun.com/article/1678046)
- **B-Stock (CONFIRMED):** the ToS forbid using "any robot, spider, scraper, data mining tool, data gathering or extraction tool, or any other automated means, to access, collect, copy or record the Services". The seller Supply Services Agreement also bars crawlers and monitoring. No public buyer API was found. — [B-Stock Terms of Use](https://bstock.com/terms-of-use/); [B-Stock Supply Services Agreement](https://bstock.com/supplystore/seller_agreement/)

### Inferences
- HYPOTHESIS: eBay stays the only **multi-seller source with an official open API** already usable by MON STOCK. Filtering on wholesale-lot categories and condition IDs may surface B2B-like lots, at retail-marketplace prices.

### Gaps
- Amazon Business renewed or bulk refurbished: no results found.
- Official Alibaba ICBU buyer API docs and terms: not reached (fetch blocked).

## Q10. Grading standards, and is it realistic for a very small French reseller to get access?

### Takeaway
There is **no shared grading standard** across these platforms (A/B/C, "A/B", "ROP Grade A", "CPO", battery thresholds), so normalisation is mandatory. For a micro-reseller, the realistic routes are **Foxway (official feed on request, €2k MOQ)**, **Callisto (KYC with a VAT number, escrow, free sign-up)** and **Merkandi (€191–279/yr)**. gsmExchange's reference and volume requirements make it hard to join at first.

### Cited Findings
- Grade definitions vary by seller. iOutlet sets battery-health thresholds of 85% for A and 80% for B. Foxway says ungraded Excel lists mean about 80% A/B and 20% C. — [iOutlet Business](https://business.theioutlet.com/); [Foxway Wholesale FAQ](https://wholesale.foxway.com/faqs)
- gsmExchange requires two wholesale trade references and a minimum trading volume. — [gsmExchange Terms](https://www.gsmexchange.com/en/terms)
- Callisto requires a company registration number, tax number and VAT number, and has no buyer sign-up fee. — [Callisto registration](https://callisto.tech/knowledge-centre/en/how-to-register-your-business-on-callisto); [For buyers](https://callisto.tech/for-buyers)
- A sourcing guide notes that most B2B distributors still rely on manual quotes, and that buyers should ask for EDI or API order sync. — [Alibaba B2B mobile sourcing guide](https://electronics.alibaba.com/buyingguides/b2b-mobile-phone-sourcing-guide)

### Inferences
- HYPOTHESIS: **no single candidate meets every target criterion** (many sellers, real pro prices, structured grades, capacity, stock, and an open API). The marketplaces (gsmExchange, Callisto, Merkandi, GSM-B2B) have the sellers but no public API. The wholesalers (Foxway) have a feed but only one seller.
- HYPOTHESIS: a pragmatic plan is (1) ask Foxway for its customized API or Excel feed and plug it into the existing supplier-import pipeline, (2) open a Callisto buyer account and ask whether an export is allowed, and (3) apply to gsmExchange later, once there is trade history and references (Foxway and Refreshed Apples could serve as references).
- CTIA grading: no EU marketplace citing CTIA grading together with an API was found in this research.

### Gaps
- No Reddit or forum feedback was found for any platform except the TradeTrust Trustpilot page. The r/smartphonerepair search returned nothing relevant.
- Every "API / storage / sync frequency / third-party software" question stays **à confirmer auprès du fournisseur** for every candidate except B-Stock, where it is explicitly forbidden.
