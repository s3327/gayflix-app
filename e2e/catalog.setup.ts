import { test as setup } from "@playwright/test";
import { sql } from "./accounts";

/**
 * The seed titles other tests press Play on get a video source, as an
 * admin would add one (src/lib/admin-video-actions.ts): without one, a
 * title is "Coming soon" and has no Play button or server tabs. The host
 * is on the test server's VIDEO_HOSTS (playwright.config.ts) but doesn't
 * exist, so the frame stays empty. e2e/player.spec.ts tests playing.
 */
setup("give the seed titles the tests play a video source", async () => {
  await sql(
    `INSERT INTO video_source (id, "mediaId", "episodeId", label, kind, url, position, "updatedAt")
     VALUES ('e2e-source-chosen-family', 'chosen-family', NULL, 'Server 1', 'embed',
             'https://player.e2e.example/embed/chosen-family', 1, now()),
            ('e2e-source-brownstone-1', NULL, 'the-brownstone-season-1-episode-1', 'Server 1', 'embed',
             'https://player.e2e.example/embed/the-brownstone-season-1-episode-1', 1, now()),
            ('e2e-source-brownstone-2', NULL, 'the-brownstone-season-1-episode-2', 'Server 1', 'embed',
             'https://player.e2e.example/embed/the-brownstone-season-1-episode-2', 1, now())
     ON CONFLICT (id) DO NOTHING`,
    []
  );
});
