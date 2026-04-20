export type CroRegressionFixture = {
  url: string;
  expected: {
    heroDualCtaStatus: "pass" | "warn" | "fail";
    faqDepthStatus: "pass" | "warn" | "fail";
    footerCtaStatus: "pass" | "warn" | "fail";
    scoreRange: [number, number];
  };
};

// Golden fixtures for manual and automated CRO rule regression validation.
export const CRO_REGRESSION_FIXTURES: CroRegressionFixture[] = [
  {
    url: "https://www.hubspot.com/products/data",
    expected: {
      heroDualCtaStatus: "pass",
      faqDepthStatus: "pass",
      footerCtaStatus: "pass",
      scoreRange: [90, 95],
    },
  },
];
