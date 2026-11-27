import { Composition } from "remotion";
import { MapStory, type StoryProps } from "./MapStory";
import timeline from "./data/timeline.json";
import i18n from "./data/i18n.json";

// FamilyStory          1920x1080, for desktop, YouTube, a TV
// FamilyStoryVertical  1080x1920, for Instagram Reels, TikTok, YouTube Shorts, WhatsApp status
// ...-<lang>           the same in another language (src/data/lang/<lang>.json, `npm run vo -- --lang <lang>`)
// Subtitles can be switched off for any of them: --props='{"subs":false}'
const variants = i18n as unknown as Record<string, { timeline: { total: number } }>;

export const RemotionRoot: React.FC = () => {
  const langs: [string, number, StoryProps][] = [
    ["", timeline.total, {}],
    ...Object.entries(variants).map(([k, v]) => [`-${k}`, v.timeline.total, { lang: k }] as [string, number, StoryProps]),
  ];
  return (
    <>
      {langs.map(([suffix, total, props]) => (
        <Composition key={"w" + suffix} id={`FamilyStory${suffix}`} component={MapStory} defaultProps={props}
          durationInFrames={Math.max(1, total)} fps={30} width={1920} height={1080} />
      ))}
      {langs.map(([suffix, total, props]) => (
        <Composition key={"v" + suffix} id={`FamilyStoryVertical${suffix}`} component={MapStory} defaultProps={props}
          durationInFrames={Math.max(1, total)} fps={30} width={1080} height={1920} />
      ))}
    </>
  );
};
