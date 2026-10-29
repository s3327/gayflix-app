import { describe, expect, it } from "vitest";
import {
  buildDefaultMovieEmbedUrl,
  buildDefaultEpisodeEmbedUrl,
  buildDefaultMovieIframeHtml,
  buildEmbedQueryUrl,
} from "./embed-builder";

describe("embed-builder", () => {
  describe("buildDefaultMovieEmbedUrl", () => {
    it("uses IMDb ID as primary identifier", () => {
      const url = buildDefaultMovieEmbedUrl({ imdbId: "tt27987047", tmdbId: 1022789 });
      expect(url).toBe("https://gayflix.my.id/embed/movie/tt27987047");
    });

    it("falls back to numeric TMDB ID when IMDb ID is missing", () => {
      const url = buildDefaultMovieEmbedUrl({ imdbId: null, tmdbId: 1022789 });
      expect(url).toBe("https://gayflix.my.id/embed/movie/1022789");
    });

    it("handles string or prefixed TMDB ID correctly", () => {
      const url = buildDefaultMovieEmbedUrl({ tmdbId: "tmdb-550" });
      expect(url).toBe("https://gayflix.my.id/embed/movie/550");
    });

    it("returns null when neither identifier is available", () => {
      expect(buildDefaultMovieEmbedUrl({})).toBeNull();
      expect(buildDefaultMovieEmbedUrl({ imdbId: "", tmdbId: null })).toBeNull();
    });
  });

  describe("buildDefaultEpisodeEmbedUrl", () => {
    it("builds episode embed URL using IMDb ID as primary", () => {
      const url = buildDefaultEpisodeEmbedUrl({
        imdbId: "tt27987047",
        tmdbId: 1399,
        seasonNumber: 1,
        episodeNumber: 1,
      });
      expect(url).toBe("https://gayflix.my.id/embed/tv/tt27987047/1/1");
    });

    it("falls back to TMDB ID for episode embed URL", () => {
      const url = buildDefaultEpisodeEmbedUrl({
        tmdbId: 1399,
        seasonNumber: 2,
        episodeNumber: 5,
      });
      expect(url).toBe("https://gayflix.my.id/embed/tv/1399/2/5");
    });

    it("returns null when neither identifier is available", () => {
      expect(
        buildDefaultEpisodeEmbedUrl({
          seasonNumber: 1,
          episodeNumber: 1,
        })
      ).toBeNull();
    });
  });

  describe("buildEmbedQueryUrl", () => {
    it("builds movie query URLs for IMDb and TMDB", () => {
      expect(buildEmbedQueryUrl("movie", { imdbId: "tt1300854" })).toBe(
        "https://gayflix.my.id/embed/movie?imdb=tt1300854"
      );
      expect(buildEmbedQueryUrl("movie", { tmdbId: 1300854 })).toBe(
        "https://gayflix.my.id/embed/movie?tmdb=1300854"
      );
    });

    it("builds TV query URLs for IMDb and TMDB", () => {
      expect(
        buildEmbedQueryUrl("tv", { imdbId: "tt0944947", season: 1, episode: 1 })
      ).toBe("https://gayflix.my.id/embed/tv?imdb=tt0944947&season=1&episode=1");

      expect(
        buildEmbedQueryUrl("tv", { tmdbId: 1399, season: 1, episode: 1 })
      ).toBe("https://gayflix.my.id/embed/tv?tmdb=1399&season=1&episode=1");
    });
  });

  describe("buildDefaultMovieIframeHtml", () => {
    it("renders the exact iframe embed markup requested by user", () => {
      const html = buildDefaultMovieIframeHtml("https://gayflix.my.id/embed/movie/tt27987047");
      expect(html).toBe(
        '<iframe src="https://gayflix.my.id/embed/movie/tt27987047" width="100%" height="560" frameborder="0" allowfullscreen></iframe>'
      );
    });
  });
});
