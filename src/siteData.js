export const rootOrder = [
  "Home / Who I Am",
  "Services",
  "Case Studies",
  "Articles",
  "Contact Me"
];

export const siteData = {
  name: "Website",
  description: "Full sitemap view.",
  children: [
    {
      name: "Home / Who I Am",
      value: 40,
      color: "#5d8fb3",
      description: "The front door: positioning, story, credibility, and next action."
    },
    {
      name: "Services",
      value: 52,
      color: "#8b79b8",
      description: "Primary offers and paths for prospective clients."
    },
    {
      name: "Case Studies",
      value: 42,
      color: "#c58b78",
      description: "Outcome-driven stories showing transformation."
    },
    {
      name: "Articles",
      value: 46,
      color: "#6fa892",
      description: "Thought leadership, essays, tutorials, and evergreen resources."
    },
    {
      name: "Contact Me",
      value: 22,
      color: "#c7ad72",
      template: "contact",
      description: "Need AI knowledge tools now? Reach out through email, GitHub, or LinkedIn.",
      links: [
        {
          label: "info@knowledgealgorithms.com",
          href: "mailto:info@knowledgealgorithms.com"
        },
        {
          label: "github.com/doc1000",
          href: "https://github.com/doc1000"
        },
        {
          label: "linkedin.com/in/dosteresh",
          href: "https://www.linkedin.com/in/dosteresh/"
        }
      ],
      children: [
        {
          name: "Email",
          value: 8,
          template: "contact",
          description: "Reach out directly by email.",
          links: [
            {
              label: "info@knowledgealgorithms.com",
              href: "mailto:info@knowledgealgorithms.com"
            }
          ]
        },
        {
          name: "GitHub",
          value: 7,
          template: "contact",
          description: "Explore public work, experiments, and technical artifacts.",
          links: [
            {
              label: "github.com/doc1000",
              href: "https://github.com/doc1000"
            }
          ]
        },
        {
          name: "LinkedIn",
          value: 7,
          template: "contact",
          description: "Connect professionally and see current background, work, and updates.",
          links: [
            {
              label: "linkedin.com/in/dosteresh",
              href: "https://www.linkedin.com/in/dosteresh/"
            }
          ]
        }
      ]
    }
  ]
};