// news.js — real-world stories that show each recipe's idea at work in business
export const NEWS = {
  1: [
    { head: 'AWS adds “Search Nearby” on GrabMaps for Singapore and Malaysia', src: 'Amazon Web Services', date: '31 Jul 2026', url: 'https://aws.amazon.com/about-aws/whats-new/2026/07/amazon-location-service-search-nearby-grabmaps', link: 'Find places within a radius, ranked by distance: the “Nearest to a point” block, sold as a cloud service built on Grab’s own map data.' },
    { head: 'India Post launches DIGIPIN, a 4 m × 4 m code for every spot in India', src: 'The Week', date: '31 May 2025', url: 'https://www.theweek.in/news/sci-tech/2025/05/31/what-is-digipin-india-new-technology-postal-geo-address-system-department-of-posts.html', link: 'A national grid with a permanent code per cell, built from latitude and longitude: the same idea as H3 hexagons, applied to addressing.' },
  ],
  2: [
    { head: 'Uber prices each city zone separately; a block’s walk can halve the fare', src: 'ProPublica', date: '29 Oct 2015', url: 'https://www.propublica.org/article/uber-surge-pricing-may-not-lead-to-a-surge-in-drivers', link: 'Neighbouring zones can surge very differently. Defining “neighbour” and watching the lag across zones is a pricing question.' },
  ],
  3: [
    { head: 'Flipkart Minutes overtakes Instamart in dark stores across India’s top 10 cities', src: 'Apparel Resources, citing CLSA', date: '26 Aug 2026', url: 'https://apparelresources.com/business-news/retail/flipkart-minutes-overtakes-instamart-dark-stores-across-top-10-cities/', link: '3,536 dark stores in 10 cities, 225 of them in Gurgaon. Are they clustered where demand is, or spread for coverage? That is a point-pattern question.' },
  ],
  4: [
    { head: 'Record 209 million-dollar HDB flats sold in September 2026', src: 'Malay Mail', date: '7 Oct 2026', url: 'https://www.malaymail.com/news/singapore/2026/10/07/singapores-hdb-market-splits-record-s1m-deals-slower-overall-sales/238098', link: 'Toa Payoh (33), Queenstown (28) and Bedok (20) led. Compare with the High-High hotspots the LISA and Gi* blocks find in the HDB price data.' },
  ],
  5: [
    { head: 'Blinkit crosses 1,000 dark stores and targets 2,000', src: 'Outlook Business', date: '20 Jan 2025', url: 'https://www.outlookbusiness.com/start-up/e-commerce/blinkit-crosses-1000-dark-store-milestone-as-quick-commerce-race-heats-up', link: 'Each dark store serves a cluster of nearby demand. DBSCAN-style clustering on orders is how such territories are drawn.' },
  ],
  6: [
    { head: 'YES-TECH: satellites now carry 30% weight in India’s crop-insurance yield estimates', src: 'Vassar Labs', date: '13 Aug 2026', url: 'https://vassarlabs.com/yes-tech-explained-how-satellites-estimate-crop-yield-for-insurance/', link: 'Canopy greenness from satellites plus ground samples, scaled up to whole districts under PMFBY: NDVI and interpolation deciding insurance pay-outs.' },
  ],
  7: [
    { head: 'Old Gurugram metro: 28.5 km and 27 stations from Millennium City Centre', src: 'The Tribune', date: '16 Feb 2024', url: 'https://www.tribuneindia.com/news/haryana/old-gurugram-to-get-metro-service-pm-lays-foundation-591642', link: 'A new line changes every block’s “distance to metro”. Regression and GWR estimate how much that is worth, and where.' },
    { head: 'How Singapore decides where hawker centres go', src: 'Ministry of Sustainability and the Environment', date: '15 Oct 2024', url: 'https://www.mse.gov.sg/latest-news/written-reply-to-pq-on-planning-for-hawker-centres/', link: 'Population served, nearby food options and land use: the same variables a location model weighs when it explains or predicts demand.' },
  ],
};
