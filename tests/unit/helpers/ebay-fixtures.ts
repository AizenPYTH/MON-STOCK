/** Réponses eBay SIMULÉES partagées par les tests (formes documentées par eBay ; aucune donnée réelle). */

export const tradingXml = (call: string, body: string, ack = "Success") => `<?xml version="1.0" encoding="UTF-8"?><${call}Response xmlns="urn:ebay:apis:eBLBaseComponents"><Timestamp>2026-10-20T10:00:00.000Z</Timestamp><Ack>${ack}</Ack>${body}</${call}Response>`;

const wrap = tradingXml;
const EUR = (value: string) => ({ value, currency: "EUR" });

export const ORDER = {
  orderId: "12-34567-89012",
  legacyOrderId: "12-34567-89012",
  creationDate: "2026-10-18T09:15:00.000Z",
  lastModifiedDate: "2026-10-19T10:00:00.000Z",
  orderFulfillmentStatus: "IN_PROGRESS",
  orderPaymentStatus: "PARTIALLY_REFUNDED",
  salesRecordReference: "1042",
  buyer: {
    username: "acheteur_77",
    taxAddress: { city: "Lyon", postalCode: "69003", countryCode: "FR" },
    buyerRegistrationAddress: { fullName: "Jean Dupont", email: "jean.dupont@example.com", primaryPhone: { phoneNumber: "0612345678" }, contactAddress: { addressLine1: "12 rue Secrète", city: "Lyon" } },
  },
  pricingSummary: { priceSubtotal: EUR("420.00"), priceDiscount: EUR("-20.00"), deliveryCost: EUR("9.90"), tax: EUR("0.00"), total: EUR("409.90") },
  cancelStatus: { cancelState: "NONE_REQUESTED", cancelRequests: [{ cancelRequestedDate: "2026-10-18T10:00:00.000Z", cancelInitiator: "BUYER", cancelReason: "ORDERED_BY_MISTAKE", cancelRequestState: "REJECTED" }] },
  paymentSummary: {
    totalDueSeller: EUR("355.00"),
    payments: [{ paymentMethod: "EBAY", paymentStatus: "PAID", paymentDate: "2026-10-18T09:16:00.000Z", amount: EUR("409.90"), paymentHolds: [{ holdReason: "NEW_SELLER", holdState: "HELD", holdAmount: EUR("100.00"), expectedReleaseDate: "2026-10-25T00:00:00.000Z" }] }],
    refunds: [{ refundDate: "2026-10-19T08:00:00.000Z", amount: EUR("15.00"), refundStatus: "REFUNDED" }],
  },
  fulfillmentStartInstructions: [
    {
      fulfillmentInstructionsType: "SHIP_TO",
      minEstimatedDeliveryDate: "2026-10-21T00:00:00.000Z",
      maxEstimatedDeliveryDate: "2026-10-23T00:00:00.000Z",
      ebaySupportedFulfillment: false,
      shippingStep: { shippingCarrierCode: "COLISSIMO", shippingServiceCode: "FR_ColiposteColissimo", shipTo: { fullName: "Jean Dupont", contactAddress: { addressLine1: "12 rue Secrète", addressLine2: "Bât B", city: "Lyon", postalCode: "69003", countryCode: "FR" }, primaryPhone: { phoneNumber: "0612345678" }, email: "jean.dupont@example.com" } },
    },
  ],
  totalMarketplaceFee: EUR("54.90"),
  totalFeeBasisAmount: EUR("409.90"),
  buyerCheckoutNotes: "Merci d'appeler au 06 12 34 56 78 ou jean.dupont@example.com",
  lineItems: [
    {
      lineItemId: "10001",
      legacyItemId: "405123456789",
      sku: "IP13-128-NOIR",
      title: "iPhone 13 128 Go Noir",
      quantity: 1,
      lineItemCost: EUR("420.00"),
      total: EUR("409.90"),
      deliveryCost: { shippingCost: EUR("9.90") },
      lineItemFulfillmentStatus: "NOT_STARTED",
      appliedPromotions: [{ promotionId: "P1", description: "Soldes -20 €", discountAmount: EUR("20.00") }],
      taxes: [{ taxType: "VAT", amount: EUR("0.00") }],
      refunds: [{ refundDate: "2026-10-19T08:00:00.000Z", amount: EUR("15.00") }],
      lineItemFulfillmentInstructions: { shipByDate: "2026-10-20T22:59:59.000Z", minEstimatedDeliveryDate: "2026-10-21T00:00:00.000Z", maxEstimatedDeliveryDate: "2026-10-23T00:00:00.000Z", guaranteedDelivery: false },
      properties: { soldViaAdCampaign: true },
      variationAspects: [{ name: "Couleur", value: "Noir" }],
    },
  ],
};


export const GET_ITEM_XML = wrap(
  "GetItem",
  `<Item>
    <ItemID>405123456789</ItemID><Title>iPhone 13 128 Go Noir</Title><SKU>IP13-128-NOIR</SKU>
    <ListingType>FixedPriceItem</ListingType><ListingDuration>GTC</ListingDuration><Site>France</Site><Country>FR</Country><Location>Paris</Location>
    <StartPrice currencyID="EUR">449.0</StartPrice><Quantity>5</Quantity>
    <SellingStatus><CurrentPrice currencyID="EUR">429.0</CurrentPrice><QuantitySold>3</QuantitySold><BidCount>0</BidCount><ListingStatus>Active</ListingStatus>
      <PromotionalSaleDetails><OriginalPrice currencyID="EUR">449.0</OriginalPrice><EndTime>2026-10-31T23:00:00.000Z</EndTime></PromotionalSaleDetails></SellingStatus>
    <ListingDetails><StartTime>2026-08-01T10:00:00.000Z</StartTime><EndTime>2026-11-01T10:00:00.000Z</EndTime><ViewItemURL>https://www.ebay.fr/itm/405123456789</ViewItemURL><BestOfferAutoAcceptPrice currencyID="EUR">410.0</BestOfferAutoAcceptPrice></ListingDetails>
    <WatchCount>14</WatchCount>
    <BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled><BestOfferCount>2</BestOfferCount></BestOfferDetails>
    <ConditionID>2010</ConditionID><ConditionDisplayName>Excellent - Reconditionné</ConditionDisplayName>
    <PrimaryCategory><CategoryID>9355</CategoryID><CategoryName>Téléphones mobiles</CategoryName></PrimaryCategory>
    <DispatchTimeMax>1</DispatchTimeMax>
    <SellerProfiles><SellerShippingProfile><ShippingProfileName>Colissimo 48h</ShippingProfileName></SellerShippingProfile><SellerReturnProfile><ReturnProfileName>30 jours</ReturnProfileName></SellerReturnProfile></SellerProfiles>
    <ShippingDetails><ShippingServiceOptions><ShippingService>FR_ColiposteColissimo</ShippingService><ShippingServiceCost currencyID="EUR">0.0</ShippingServiceCost><FreeShipping>true</FreeShipping></ShippingServiceOptions></ShippingDetails>
    <ItemSpecifics><NameValueList><Name>Marque</Name><Value>Apple</Value></NameValueList><NameValueList><Name>Couleur</Name><Value>Noir</Value></NameValueList></ItemSpecifics>
    <PictureDetails><PictureURL>https://i.ebayimg.com/1.jpg</PictureURL><PictureURL>https://i.ebayimg.com/2.jpg</PictureURL></PictureDetails>
    <Description>&lt;p&gt;Très long HTML&lt;/p&gt;</Description>
  </Item>`,
);

