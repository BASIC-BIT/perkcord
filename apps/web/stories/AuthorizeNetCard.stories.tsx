import type { Meta, StoryObj } from "@storybook/react";
import { AuthorizeNetCard } from "../app/subscribe/pay/AuthorizeNetCard";

const meta: Meta<typeof AuthorizeNetCard> = {
  title: "Subscribe/AuthorizeNetCard",
  component: AuthorizeNetCard,
  args: {
    tierSlug: "plus",
    guildId: "123456789012345678",
    amount: "$15",
    mode: "subscription",
    intervalLabel: "month",
    apiLoginId: "ANET_LOGIN_ID",
    clientKey: "ANET_CLIENT_KEY",
    configError: null,
  },
};

export default meta;

type Story = StoryObj<typeof AuthorizeNetCard>;

export const Ready: Story = {};

export const MissingConfig: Story = {
  args: {
    apiLoginId: null,
    clientKey: null,
  },
};
