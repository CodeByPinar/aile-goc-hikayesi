import { Composition } from "remotion";
import { MapStory } from "./MapStory";
import timeline from "./data/timeline.json";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FamilyStory"
      component={MapStory}
      durationInFrames={Math.max(1, timeline.total)}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
