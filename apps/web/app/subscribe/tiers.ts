export type Tier = {
  id: string;
  name: string;
  price: string;
  description: string;
  perks: string[];
};

export const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$5 / month",
    description: "Entry access for community supporters.",
    perks: ["Member role", "Community chat", "Weekly updates"],
  },
  {
    id: "plus",
    name: "Plus",
    price: "$15 / month",
    description: "More perks for active members.",
    perks: ["All Starter perks", "Priority channels", "Monthly Q&A"],
  },
  {
    id: "legend",
    name: "Legend",
    price: "$120 / year",
    description: "Annual pass with lifetime badge.",
    perks: ["All Plus perks", "Annual swag drop", "Backstage updates"],
  },
];

export const getTier = (id?: string) => TIERS.find((tier) => tier.id === id) ?? TIERS[0];
