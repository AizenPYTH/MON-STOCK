import { describe, expect, it } from "vitest";
import { buildGetMyeBaySellingRequest, buildReviseInventoryStatusRequest, parseGetMyeBaySellingResponse, parseReviseInventoryStatusResponse, isTradingAuthError } from "@/integrations/ebay/trading";
import { ConnectorError } from "@/integrations/core/errors";

const activeListXml = `<?xml version="1.0" encoding="UTF-8"?>
<GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Timestamp>2026-10-07T10:00:00.000Z</Timestamp><Ack>Success</Ack><Version>1225</Version><Build>E1225_CORE</Build>
  <ActiveList>
    <ItemArray>
      <Item>
        <BuyItNowPrice currencyID="EUR">249.0</BuyItNowPrice>
        <ItemID>123456789012</ItemID>
        <ListingDetails><StartTime>2026-09-01T10:00:00.000Z</StartTime><EndTime>2026-11-01T10:00:00.000Z</EndTime><ViewItemURL>https://www.ebay.fr/itm/123456789012</ViewItemURL></ListingDetails>
        <ListingType>FixedPriceItem</ListingType>
        <Quantity>10</Quantity>
        <SellingStatus><CurrentPrice currencyID="EUR">249.0</CurrentPrice><QuantitySold>3</QuantitySold><ListingStatus>Active</ListingStatus></SellingStatus>
        <Title>Apple iPhone 13 128 Go Noir reconditionné</Title>
        <SKU>IPH13-128-BLK-A</SKU>
        <PictureDetails><GalleryURL>https://i.ebayimg.com/g.jpg</GalleryURL><PictureURL>https://i.ebayimg.com/1.jpg</PictureURL><PictureURL>https://i.ebayimg.com/2.jpg</PictureURL></PictureDetails>
        <QuantityAvailable>7</QuantityAvailable>
      </Item>
      <Item>
        <ItemID>223456789013</ItemID>
        <Quantity>12</Quantity>
        <SellingStatus><CurrentPrice currencyID="EUR">19.9</CurrentPrice><QuantitySold>4</QuantitySold><ListingStatus>Active</ListingStatus></SellingStatus>
        <Title>Coque silicone</Title>
        <Variations>
          <Variation>
            <SKU>COQUE-RED</SKU><StartPrice currencyID="EUR">19.9</StartPrice><Quantity>5</Quantity>
            <VariationSpecifics><NameValueList><Name>Couleur</Name><Value>Rouge</Value></NameValueList></VariationSpecifics>
            <SellingStatus><QuantitySold>1</QuantitySold></SellingStatus>
          </Variation>
          <Variation>
            <StartPrice currencyID="EUR">21.9</StartPrice><Quantity>7</Quantity>
            <VariationSpecifics><NameValueList><Name>Couleur</Name><Value>Bleu</Value></NameValueList><NameValueList><Name>Taille</Name><Value>M</Value></NameValueList></VariationSpecifics>
            <SellingStatus><QuantitySold>3</QuantitySold></SellingStatus>
          </Variation>
        </Variations>
      </Item>
      <Item>
        <ItemID>323456789014</ItemID>
        <Title>Sans quantité lisible</Title>
        <Quantity>abc</Quantity>
      </Item>
    </ItemArray>
    <PaginationResult><TotalNumberOfPages>3</TotalNumberOfPages><TotalNumberOfEntries>412</TotalNumberOfEntries></PaginationResult>
    <Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>2</PageNumber></Pagination>
  </ActiveList>
</GetMyeBaySellingResponse>`;

describe("parseGetMyeBaySellingResponse", () => {
  it("lit les annonces simples et les variations (Quantity − QuantitySold)", () => {
    const page = parseGetMyeBaySellingResponse(activeListXml);
    expect(page.pageNumber).toBe(2);
    expect(page.totalPages).toBe(3);
    expect(page.totalEntries).toBe(412);
    expect(page.invalid).toEqual([]);
    expect(page.listings).toHaveLength(3);

    const simple = page.listings[0]!;
    expect(simple.externalListingId).toBe("123456789012");
    expect(simple.sku).toBe("IPH13-128-BLK-A");
    expect(simple.title).toBe("Apple iPhone 13 128 Go Noir reconditionné");
    expect(simple.quantityListed).toBe(10);
    expect(simple.quantitySold).toBe(3);
    expect(simple.quantityAvailable).toBe(7);
    expect(simple.price).toBe(249);
    expect(simple.currency).toBe("EUR");
    expect(simple.listingUrl).toBe("https://www.ebay.fr/itm/123456789012");
    expect(simple.imageUrl).toBe("https://i.ebayimg.com/1.jpg");
    expect(simple.status).toBe("active");
    expect(simple.startedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(simple.variations).toEqual([]);

    const multi = page.listings[1]!;
    expect(multi.sku).toBeNull();
    expect(multi.variations).toHaveLength(2);
    expect(multi.variations[0]).toMatchObject({ sku: "COQUE-RED", specifics: { Couleur: "Rouge" }, quantityListed: 5, quantitySold: 1, quantityAvailable: 4, price: 19.9, currency: "EUR" });
    expect(multi.variations[1]).toMatchObject({ sku: null, specifics: { Couleur: "Bleu", Taille: "M" }, quantityListed: 7, quantitySold: 3, quantityAvailable: 4, price: 21.9 });
    // Sans QuantityAvailable explicite : somme des variations (4 + 4).
    expect(multi.quantityAvailable).toBe(8);

    // Quantité illisible → null, jamais inventée.
    const odd = page.listings[2]!;
    expect(odd.quantityListed).toBeNull();
    expect(odd.quantityAvailable).toBeNull();
  });

  it("un seul Item reste un tableau (isArray par chemin)", () => {
    const xml = `<?xml version="1.0"?><GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Success</Ack><ActiveList><ItemArray><Item><ItemID>1</ItemID><Title>Seul</Title><Quantity>2</Quantity><SellingStatus><QuantitySold>1</QuantitySold></SellingStatus></Item></ItemArray><PaginationResult><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult></ActiveList></GetMyeBaySellingResponse>`;
    const page = parseGetMyeBaySellingResponse(xml);
    expect(page.listings).toHaveLength(1);
    expect(page.listings[0]?.quantityAvailable).toBe(1);
    expect(page.totalPages).toBe(1);
  });

  it("lève AUTH_EXPIRED sur une erreur de token (21916984 / 932)", () => {
    const xml = `<?xml version="1.0"?><GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Failure</Ack><Errors><ShortMessage>Expired IAF token.</ShortMessage><LongMessage>IAF token supplied is expired.</LongMessage><ErrorCode>21916984</ErrorCode><SeverityCode>Error</SeverityCode></Errors></GetMyeBaySellingResponse>`;
    expect(() => parseGetMyeBaySellingResponse(xml)).toThrowError(ConnectorError);
    try {
      parseGetMyeBaySellingResponse(xml);
    } catch (e) {
      expect((e as ConnectorError).code).toBe("AUTH_EXPIRED");
      expect((e as ConnectorError).message).toContain("token d'autorisation a expiré");
    }
    expect(isTradingAuthError([{ code: "932", shortMessage: "Auth token is hard expired.", longMessage: "", severity: "Error" }])).toBe(true);
    expect(isTradingAuthError([{ code: "21919474", shortMessage: "Inventory API listing", longMessage: "", severity: "Error" }])).toBe(false);
  });

  it("remonte le message eBay exact pour les autres échecs et ignore les avertissements", () => {
    const xml = `<?xml version="1.0"?><GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Failure</Ack><Errors><ShortMessage>Interne</ShortMessage><LongMessage>Service temporairement indisponible.</LongMessage><ErrorCode>10007</ErrorCode><SeverityCode>Error</SeverityCode></Errors></GetMyeBaySellingResponse>`;
    expect(() => parseGetMyeBaySellingResponse(xml)).toThrowError(/Service temporairement indisponible/);
    const warning = `<?xml version="1.0"?><GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Warning</Ack><Errors><ShortMessage>Attention</ShortMessage><LongMessage>Champ obsolète.</LongMessage><ErrorCode>21917091</ErrorCode><SeverityCode>Warning</SeverityCode></Errors><ActiveList><ItemArray/></ActiveList></GetMyeBaySellingResponse>`;
    const page = parseGetMyeBaySellingResponse(warning);
    expect(page.listings).toEqual([]);
    expect(page.warnings).toEqual(["Champ obsolète."]);
  });
});

describe("requêtes Trading", () => {
  it("construit GetMyeBaySelling avec pagination", () => {
    const xml = buildGetMyeBaySellingRequest(3);
    expect(xml).toContain('<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">');
    expect(xml).toContain("<EntriesPerPage>200</EntriesPerPage>");
    expect(xml).toContain("<PageNumber>3</PageNumber>");
  });

  it("construit ReviseInventoryStatus (ItemID + SKU de variation échappé, quantité entière positive)", () => {
    const xml = buildReviseInventoryStatusRequest({ externalListingId: "123", variationSku: "A&B<C>" }, 4.9);
    expect(xml).toContain("<ItemID>123</ItemID>");
    expect(xml).toContain("<SKU>A&amp;B&lt;C&gt;</SKU>");
    expect(xml).toContain("<Quantity>4</Quantity>");
    const simple = buildReviseInventoryStatusRequest({ externalListingId: "123", variationSku: null }, -2);
    expect(simple).not.toContain("<SKU>");
    expect(simple).toContain("<Quantity>0</Quantity>");
  });

  it("interprète la réponse ReviseInventoryStatus", () => {
    const ok = `<?xml version="1.0"?><ReviseInventoryStatusResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Success</Ack><InventoryStatus><ItemID>123</ItemID><Quantity>4</Quantity></InventoryStatus></ReviseInventoryStatusResponse>`;
    expect(parseReviseInventoryStatusResponse(ok)).toEqual({ warnings: [] });
    const refused = `<?xml version="1.0"?><ReviseInventoryStatusResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Failure</Ack><Errors><ShortMessage>Inventory API listing</ShortMessage><LongMessage>This listing was created with the Inventory API and can only be revised with the Inventory API.</LongMessage><ErrorCode>21919474</ErrorCode><SeverityCode>Error</SeverityCode></Errors></ReviseInventoryStatusResponse>`;
    try {
      parseReviseInventoryStatusResponse(refused);
      expect.unreachable();
    } catch (e) {
      expect((e as ConnectorError).code).toBe("API_ERROR");
      expect((e as ConnectorError).message).toContain("created with the Inventory API");
    }
  });
});
