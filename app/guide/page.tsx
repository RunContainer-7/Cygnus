import Link from "next/link";
import Icon from "@/components/Icon";
import { DOCS_URL, docsPage } from "@/lib/docs";

const STEPS: Array<{
  title: string;
  body: string;
  docs: string;
  docsLabel: string;
}> = [
  {
    title: "Pick a model",
    body: "New installs start on Nemotron 3.5 Lightning, a hosted open-weight model with no key. On-device and local models keep every prompt on this computer.",
    docs: docsPage("models"),
    docsLabel: "Models",
  },
  {
    title: "Switch the mode to Build",
    body: "Chat is the default and only discusses the app. Plan reads the project without editing. Build writes files, so choose it before your first real prompt.",
    docs: docsPage("prompting#pick-the-right-mode"),
    docsLabel: "Modes",
  },
  {
    title: "Describe the app",
    body: "Say what it does and who it is for. One app per project, then make changes in small turns so each one is easy to check.",
    docs: docsPage("prompting"),
    docsLabel: "Prompting",
  },
  {
    title: "Check the preview",
    body: "The preview reloads after every turn. Use the device buttons for narrow layouts and the console for runtime errors.",
    docs: docsPage("previewing"),
    docsLabel: "Previewing",
  },
  {
    title: "Fix with the real error",
    body: "Paste the console message into the chat and ask for a fix. test_app runs the built-in checks over HTML, assets, JavaScript and CSS.",
    docs: docsPage("debugging"),
    docsLabel: "Debugging",
  },
  {
    title: "Checkpoint, then publish",
    body: "Build turns snapshot automatically; Studio keeps the last 20. Publish can download a .zip or upload to your own Cloudflare Pages account.",
    docs: docsPage("publishing"),
    docsLabel: "Publishing",
  },
];

export default function GuidePage() {
  return (
    <div className="page-scroll guide-page">
      <div className="guide-frame">
        <header className="guide-head">
          <span className="page-eyebrow">Quick guide</span>
          <h1>From a sentence to a published app.</h1>
          <p>
            Six steps that cover the whole loop. The complete documentation lives on its own site,
            with search and every reference page.
          </p>
          <div className="guide-actions">
            <a className="guide-primary" href={DOCS_URL} target="_blank" rel="noreferrer">
              <Icon name="book" size={15} />
              Open the full docs
              <Icon name="arrowUpRight" size={13} />
            </a>
            <Link className="guide-secondary" href="/">
              Start building
            </Link>
          </div>
        </header>

        <ol className="guide-steps">
          {STEPS.map((step, index) => (
            <li className="guide-step" key={step.title}>
              <span className="guide-num">{String(index + 1).padStart(2, "0")}</span>
              <div className="guide-step-copy">
                <h2>{step.title}</h2>
                <p>{step.body}</p>
                <a className="guide-doclink" href={step.docs} target="_blank" rel="noreferrer">
                  Read {step.docsLabel} in the docs
                  <Icon name="arrowUpRight" size={11} />
                </a>
              </div>
            </li>
          ))}
        </ol>

        <div className="guide-foot">
          <span>
            Keyboard: <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd> opens the command palette in a
            workspace.
          </span>
          <a href={docsPage("troubleshooting")} target="_blank" rel="noreferrer">
            Troubleshooting <Icon name="arrowUpRight" size={11} />
          </a>
        </div>
      </div>
    </div>
  );
}
