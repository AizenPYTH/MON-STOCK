import { describe, expect, it } from "vitest";
import { ConnectorError } from "@/integrations/core/errors";
import {
  buildGetFeedbackRequest,
  buildGetItemRequest,
  buildMessageBodyRequest,
  buildMessageHeadersRequest,
  buildSoldUnsoldRequest,
  parseGetBestOffersResponse,
  parseGetFeedbackResponse,
  parseGetItemResponse,
  parseGetUserResponse,
  parseMessageBodyResponse,
  parseMessageHeadersResponse,
  parseMessagesSummaryResponse,
  parseSoldUnsoldResponse,
} from "@/integrations/ebay/trading-insights";
import { GET_ITEM_XML, tradingXml as wrap } from "./helpers/ebay-fixtures";

/** Réponses XML Trading API SIMULÉES (structure documentée par eBay). */

describe("GetItem / GetBestOffers", () => {
  it("requête : ItemID échappé, IncludeWatchCount", () => {
    const xml = buildGetItemRequest("405123456789");
    expect(xml).toContain("<ItemID>405123456789</ItemID>");
    expect(xml).toContain("<IncludeWatchCount>true</IncludeWatchCount>");
    expect(buildGetItemRequest("<x>")).toContain("&lt;x&gt;");
  });

  it("prix, promotion, quantités, observateurs, offres, état, catégorie, politiques ; frais d'insertion null", () => {
    const i = parseGetItemResponse(GET_ITEM_XML);
    expect(i).toMatchObject({
      itemId: "405123456789",
      sku: "IP13-128-NOIR",
      status: "Active",
      startTime: "2026-08-01T10:00:00.000Z",
      endTime: "2026-11-01T10:00:00.000Z",
      price: { current: { value: 429, currency: "EUR" }, beforeMarkdown: { value: 449, currency: "EUR" }, markdownEnds: "2026-10-31T23:00:00.000Z" },
      quantity: { listed: 5, sold: 3, available: 2 },
      watchCount: 14,
      hitCount: null,
      bestOffer: { enabled: true, offersReceived: 2, autoAcceptPrice: { value: 410, currency: "EUR" } },
      condition: { id: "2010", name: "Excellent - Reconditionné" },
      category: { id: "9355", name: "Téléphones mobiles" },
      businessPolicies: { shipping: "Colissimo 48h", returns: "30 jours", payment: null },
      itemSpecifics: { Marque: "Apple", Couleur: "Noir" },
      pictures: 2,
      insertionFees: null,
    });
    expect(i.shipping).toEqual([{ service: "FR_ColiposteColissimo", cost: { value: 0, currency: "EUR" }, free: true }]);
    expect(JSON.stringify(i)).not.toContain("Très long HTML");
  });

  it("offres reçues : montant, statut, pseudo, message masqué", () => {
    const offers = parseGetBestOffersResponse(
      wrap("GetBestOffers", `<BestOfferArray><BestOffer><BestOfferID>B1</BestOfferID><ExpirationTime>2026-10-22T10:00:00.000Z</ExpirationTime><Buyer><UserID>acheteur_9</UserID><Email>x@y.fr</Email></Buyer><Price currencyID="EUR">380.0</Price><Status>Pending</Status><Quantity>1</Quantity><BuyerMessage>Dispo ? 0612345678</BuyerMessage></BestOffer></BestOfferArray>`),
    );
    expect(offers).toEqual([{ id: "B1", status: "Pending", price: { value: 380, currency: "EUR" }, quantity: 1, buyer: "acheteur_9", expiresAt: "2026-10-22T10:00:00.000Z", buyerMessage: "Dispo ? [téléphone masqué]" }]);
    expect(JSON.stringify(offers)).not.toContain("x@y.fr");
  });

  it("Ack Failure : erreur eBay explicite ; token expiré → AUTH_EXPIRED", () => {
    const fail = wrap("GetItem", `<Errors><ShortMessage>Objet introuvable.</ShortMessage><LongMessage>L'objet est introuvable.</LongMessage><ErrorCode>17</ErrorCode><SeverityCode>Error</SeverityCode></Errors>`, "Failure");
    expect(() => parseGetItemResponse(fail)).toThrow(/introuvable/);
    const expired = wrap("GetItem", `<Errors><ShortMessage>Auth token is hard expired.</ShortMessage><ErrorCode>932</ErrorCode><SeverityCode>Error</SeverityCode></Errors>`, "Failure");
    try {
      parseGetItemResponse(expired);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConnectorError);
      expect((e as ConnectorError).code).toBe("AUTH_EXPIRED");
    }
  });
});

describe("GetMyeBaySelling : vendus / invendus", () => {
  it("requête : listes active/programmée exclues, durée bornée à 60 jours", () => {
    const xml = buildSoldUnsoldRequest({ days: 400, entriesPerPage: 100 });
    expect(xml).toContain("<ActiveList><Include>false</Include></ActiveList>");
    expect(xml).toContain("<SoldList><Include>true</Include><DurationInDays>60</DurationInDays>");
    expect(xml).toContain("<UnsoldList><Include>true</Include><DurationInDays>60</DurationInDays>");
  });

  it("transactions simples et commandes multi-lignes, invendus, résumé (limites restantes)", () => {
    const r = parseSoldUnsoldResponse(
      wrap(
        "GetMyeBaySelling",
        `<Summary><TotalSoldCount>3</TotalSoldCount><TotalSoldValue currencyID="EUR">1250.0</TotalSoldValue><SoldDurationInDays>30</SoldDurationInDays><AmountLimitRemaining currencyID="EUR">18000.0</AmountLimitRemaining><QuantityLimitRemaining>420</QuantityLimitRemaining></Summary>
        <SoldList><OrderTransactionArray>
          <OrderTransaction><Transaction><Buyer><UserID>acheteur_1</UserID><Email>secret@x.fr</Email></Buyer><CreatedDate>2026-10-10T10:00:00.000Z</CreatedDate><PaidTime>2026-10-10T10:05:00.000Z</PaidTime><QuantityPurchased>1</QuantityPurchased><OrderLineItemID>405-1</OrderLineItemID><TotalTransactionPrice currencyID="EUR">429.0</TotalTransactionPrice><Item><ItemID>405123456789</ItemID><Title>iPhone 13</Title><SKU>IP13</SKU><SellingStatus><CurrentPrice currencyID="EUR">429.0</CurrentPrice></SellingStatus></Item></Transaction></OrderTransaction>
          <OrderTransaction><Order><OrderID>12-34567-89012</OrderID><TransactionArray>
            <Transaction><Buyer><UserID>acheteur_2</UserID></Buyer><CreatedDate>2026-10-15T10:00:00.000Z</CreatedDate><ShippedTime>2026-10-16T10:00:00.000Z</ShippedTime><QuantityPurchased>2</QuantityPurchased><TotalPrice currencyID="EUR">40.0</TotalPrice><Item><ItemID>405000000001</ItemID><Title>Coque</Title></Item></Transaction>
            <Transaction><Buyer><UserID>acheteur_2</UserID></Buyer><CreatedDate>2026-10-15T10:00:00.000Z</CreatedDate><QuantityPurchased>1</QuantityPurchased><Item><ItemID>405000000002</ItemID><Title>Chargeur</Title></Item></Transaction>
          </TransactionArray></Order></OrderTransaction>
        </OrderTransactionArray><PaginationResult><TotalNumberOfEntries>3</TotalNumberOfEntries></PaginationResult></SoldList>
        <UnsoldList><ItemArray><Item><ItemID>405999999999</ItemID><Title>Galaxy S21</Title><ListingDetails><EndTime>2026-10-12T10:00:00.000Z</EndTime></ListingDetails><SellingStatus><CurrentPrice currencyID="EUR">299.0</CurrentPrice></SellingStatus><WatchCount>4</WatchCount></Item></ItemArray><PaginationResult><TotalNumberOfEntries>1</TotalNumberOfEntries></PaginationResult></UnsoldList>`,
      ),
    );
    expect(r.summary).toMatchObject({ totalSoldCount: 3, totalSoldValue: { value: 1250, currency: "EUR" }, amountLimitRemaining: { value: 18000, currency: "EUR" }, quantityLimitRemaining: 420 });
    expect(r.sold.totalEntries).toBe(3);
    expect(r.sold.entries.map((e) => [e.orderId, e.itemId, e.quantity, e.total?.value ?? null, e.buyer])).toEqual([
      ["12-34567-89012", "405000000001", 2, 40, "acheteur_2"],
      ["12-34567-89012", "405000000002", 1, null, "acheteur_2"],
      [null, "405123456789", 1, 429, "acheteur_1"],
    ]);
    expect(r.sold.entries[2]).toMatchObject({ paidAt: "2026-10-10T10:05:00.000Z", shippedAt: null, sku: "IP13" });
    expect(r.unsold.entries).toEqual([{ itemId: "405999999999", title: "Galaxy S21", sku: null, price: { value: 299, currency: "EUR" }, quantity: null, watchCount: 4, bidCount: null, startTime: null, endTime: "2026-10-12T10:00:00.000Z", listingType: null }]);
    expect(JSON.stringify(r)).not.toContain("secret@x.fr");
  });
});

describe("GetFeedback / GetUser", () => {
  it("requête : évaluations reçues comme vendeur, filtre par type, 25 minimum", () => {
    const xml = buildGetFeedbackRequest({ commentTypes: ["Negative", "Neutral"] });
    expect(xml).toContain("<FeedbackType>FeedbackReceivedAsSeller</FeedbackType>");
    expect(xml).toContain("<CommentType>Negative</CommentType>");
    expect(xml).toContain("<EntriesPerPage>25</EntriesPerPage>");
  });

  it("score, périodes, notes détaillées, commentaires (coordonnées masquées)", () => {
    const f = parseGetFeedbackResponse(
      wrap(
        "GetFeedback",
        `<FeedbackDetailArray>
          <FeedbackDetail><CommentingUser>acheteur_3</CommentingUser><CommentingUserScore>12</CommentingUserScore><CommentText>Colis jamais reçu, appelez-moi 0612345678</CommentText><CommentTime>2026-10-12T10:00:00.000Z</CommentTime><CommentType>Negative</CommentType><ItemID>405123456789</ItemID><ItemTitle>iPhone 13</ItemTitle><ItemPrice currencyID="EUR">429.0</ItemPrice><FeedbackResponse>Colis livré le 10/10, preuve fournie.</FeedbackResponse></FeedbackDetail>
        </FeedbackDetailArray>
        <FeedbackDetailItemTotal>1</FeedbackDetailItemTotal>
        <FeedbackSummary>
          <NegativeFeedbackPeriodArray><FeedbackPeriod><PeriodInDays>30</PeriodInDays><Count>1</Count></FeedbackPeriod><FeedbackPeriod><PeriodInDays>365</PeriodInDays><Count>2</Count></FeedbackPeriod></NegativeFeedbackPeriodArray>
          <PositiveFeedbackPeriodArray><FeedbackPeriod><PeriodInDays>30</PeriodInDays><Count>40</Count></FeedbackPeriod><FeedbackPeriod><PeriodInDays>365</PeriodInDays><Count>410</Count></FeedbackPeriod></PositiveFeedbackPeriodArray>
          <SellerRatingSummaryArray><AverageRatingSummary><FeedbackSummaryPeriod>FiftyTwoWeeks</FeedbackSummaryPeriod><AverageRatingDetails><RatingDetail>ShippingTime</RatingDetail><Rating>4.9</Rating><RatingCount>380</RatingCount></AverageRatingDetails></AverageRatingSummary></SellerRatingSummaryArray>
          <UniqueNegativeFeedbackCount>2</UniqueNegativeFeedbackCount>
        </FeedbackSummary>
        <FeedbackScore>1520</FeedbackScore>`,
      ),
    );
    expect(f.score).toBe(1520);
    expect(f.periods["365j"]).toEqual({ positive: 410, neutral: null, negative: 2, total: null });
    expect(f.detailedRatings).toEqual([{ period: "FiftyTwoWeeks", criterion: "ShippingTime", rating: 4.9, count: 380 }]);
    expect(f.entries[0]).toMatchObject({ type: "Negative", buyer: "acheteur_3", itemId: "405123456789", sellerResponse: "Colis livré le 10/10, preuve fournie.", comment: "Colis jamais reçu, appelez-moi [téléphone masqué]" });
  });

  it("GetUser : % positives, Top Fiabilité ; jamais l'e-mail ni l'adresse", () => {
    const u = parseGetUserResponse(wrap("GetUser", `<User><UserID>vendeur_pro</UserID><Email>vendeur@pro.fr</Email><FeedbackScore>1520</FeedbackScore><PositiveFeedbackPercent>99.6</PositiveFeedbackPercent><FeedbackRatingStar>Purple</FeedbackRatingStar><RegistrationAddress><Street1>3 rue X</Street1></RegistrationAddress><SellerInfo><TopRatedSeller>true</TopRatedSeller><StoreOwner>true</StoreOwner></SellerInfo></User>`));
    expect(u).toMatchObject({ userId: "vendeur_pro", feedbackScore: 1520, positiveFeedbackPercent: 99.6, topRatedSeller: true, storeOwner: true });
    expect(JSON.stringify(u)).not.toMatch(/vendeur@pro\.fr|rue X/);
  });
});

describe("GetMyMessages", () => {
  it("requêtes : en-têtes de la boîte de réception sur une période ; corps d'un message par identifiant", () => {
    const h = buildMessageHeadersRequest({ from: new Date("2026-10-06T10:00:00.000Z"), to: new Date("2026-10-20T10:00:00.000Z"), entriesPerPage: 100, page: 1 });
    expect(h).toContain("<DetailLevel>ReturnHeaders</DetailLevel>");
    expect(h).toContain("<FolderID>0</FolderID>");
    expect(h).toContain("<StartTime>2026-10-06T10:00:00.000Z</StartTime>");
    expect(buildMessageBodyRequest("123456")).toContain("<MessageIDs><MessageID>123456</MessageID></MessageIDs>");
  });

  it("résumé (non lus), en-têtes (lu / non lu, objet, lien), corps (HTML → texte, coordonnées masquées)", () => {
    const summary = parseMessagesSummaryResponse(wrap("GetMyMessages", `<Summary><FolderSummary><FolderID>0</FolderID><FolderName>Inbox</FolderName><NewMessageCount>3</NewMessageCount><TotalMessageCount>57</TotalMessageCount></FolderSummary><NewMessageCount>3</NewMessageCount><TotalMessageCount>60</TotalMessageCount></Summary>`));
    expect(summary).toMatchObject({ newMessages: 3, totalMessages: 60, folders: [{ id: "0", name: "Inbox", newMessages: 3, total: 57 }] });
    const msg = `<Message><Sender>acheteur_4</Sender><Subject>Question sur iPhone 13</Subject><MessageID>987654</MessageID><Read>false</Read><Replied>false</Replied><ReceiveDate>2026-10-19T18:00:00.000Z</ReceiveDate><ItemID>405123456789</ItemID><ItemTitle>iPhone 13</ItemTitle><MessageType>AskSellerQuestion</MessageType><ResponseDetails><ResponseEnabled>true</ResponseEnabled></ResponseDetails><Text>&lt;div&gt;Bonjour, la batterie est à combien ?&lt;br&gt;Écrivez-moi : a@b.fr&lt;/div&gt;</Text></Message>`;
    const headers = parseMessageHeadersResponse(wrap("GetMyMessages", `<Messages>${msg}</Messages><PaginationResult><TotalNumberOfPages>1</TotalNumberOfPages><TotalNumberOfEntries>1</TotalNumberOfEntries></PaginationResult>`));
    expect(headers.headers[0]).toMatchObject({ messageId: "987654", sender: "acheteur_4", read: false, itemUrl: "https://www.ebay.fr/itm/405123456789", messageType: "AskSellerQuestion", responseEnabled: true });
    expect(headers.headers[0]).not.toHaveProperty("body");
    const body = parseMessageBodyResponse(wrap("GetMyMessages", `<Messages>${msg}</Messages>`));
    expect(body?.body).toBe("Bonjour, la batterie est à combien ?\nÉcrivez-moi : [e-mail masqué]");
    expect(parseMessageBodyResponse(wrap("GetMyMessages", ""))).toBeNull();
  });
});
