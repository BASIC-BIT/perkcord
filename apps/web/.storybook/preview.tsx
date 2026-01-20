import type { Preview } from "@storybook/react";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: {
      appDirectory: true,
    },
  },
  decorators: [
    (Story) => (
      <div className="page-shell">
        <div className="page-frame">
          <div className="card p-6">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
};

export default preview;
