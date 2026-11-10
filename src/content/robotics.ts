/* The Pitt Pirates story, shared by the Journal's /robotics page and Sid Search's Robotics section. */

export const roboticsTeam = {
  name: "Pitt Pirates",
  number: 2642,
  location: "Pitt County, North Carolina",
  years: "2013-2018",
  captainYear: 2017,
  captainGame: "FIRST Steamworks",
  website: "https://www.pittpiratesrobotics.com/",
  gallery: "https://www.pittpiratesrobotics.com/about-us/our-robots/",
  history: "https://www.thebluealliance.com/team/2642/history",
  firstRecord: "https://frc-events.firstinspires.org/2017/team/2642"
};

export type RobotSeason = {
  year: number;
  robot: string;
  summary: string;
  /* Official events won and FIRST Championship appearance, matching the summary. */
  wins: number;
  championship: boolean;
};

export const robotSeasons: RobotSeason[] = [
  { year: 2013, robot: "Ashley Whippet", summary: "Innovation in Control Award at the North Carolina Regional.", wins: 0, championship: false },
  { year: 2014, robot: "JoJo", summary: "North Carolina Regional Chairman's Award and a Championship appearance.", wins: 0, championship: true },
  { year: 2016, robot: "Excalibot", summary: "Wake County district win and District Chairman's Award.", wins: 1, championship: true },
  { year: 2017, robot: "Gemini", summary: "Pitt County and Raleigh district wins, the North Carolina State Championship Chairman's Award, and Raleigh's Industrial Design Award. Third in the district points standings.", wins: 2, championship: true },
  { year: 2018, robot: "Riptide", summary: "Pitt County and UNC Pembroke district wins, including an undefeated 18-0 Pembroke event, and a Turing division-finalist finish at the Houston Championship.", wins: 2, championship: true }
];

export const seasonHref = (year: number) => `https://www.thebluealliance.com/team/2642/${year}`;

/* Every robot from my six seasons, including 2015's, which has no season result above. */
export const robotNames = ["Ashley Whippet", "JoJo", "The Pickup Line", "Excalibot", "Gemini", "Riptide"];

export const robotCode = [
  { label: "2017 robot code", href: "https://github.com/FRC2642/2017Robot" },
  { label: "2018 robot code", href: "https://github.com/FRC2642/2018Robot" }
];

export type FeaturedMatch = {
  id: string;
  title: string;
  event: string;
  result: string;
  description: string;
  publisher: string;
  record: string;
};

export const featuredMatches: FeaturedMatch[] = [
  {
    id: "23Ge6Ods51A",
    title: "Gemini at the World Championship",
    event: "2017 Houston Championship, Roebling Qualification 14",
    result: "370-255 alliance win",
    description: "Our alliance completed all four rotors and all three endgame climbs. Team 2642 is on the red alliance in this match from my captain season.",
    publisher: "Felix Giffard",
    record: "https://www.thebluealliance.com/match/2017roe_qm14"
  },
  {
    id: "VzhwTXsN2io",
    title: "The match that clinched Raleigh",
    event: "2017 Raleigh District, Final 3",
    result: "305-256 alliance win",
    description: "After losing the first final by one point, our alliance won the next two to take the event. Team 2642 captained the winning alliance with teams 5190 and 6004.",
    publisher: "Team2059Archive",
    record: "https://www.thebluealliance.com/match/2017ncral_f1m3"
  }
];

export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const youtubeEmbedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
export const youtubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export type RobotPhoto = { src: string; alt: string; caption: string; source: string };

export const leadPhoto: RobotPhoto = {
  src: "https://www.pittpiratesrobotics.com/wp-content/uploads/2012/01/20170401-11351834.jpg",
  alt: "Gemini, Team 2642's 2017 robot, with its gear mechanism and fuel hopper in the pit",
  caption: "Gemini, 2017.",
  source: roboticsTeam.gallery
};

export const galleryPhotos: RobotPhoto[] = [
  {
    src: "https://www.pittpiratesrobotics.com/wp-content/uploads/2018/09/20180317-13135308.jpg",
    alt: "Riptide, Team 2642's 2018 robot, handling a cube on the competition field",
    caption: "Riptide, 2018.",
    source: roboticsTeam.gallery
  },
  {
    src: "https://www.pittpiratesrobotics.com/wp-content/uploads/2014/03/ChairmansAward.jpg",
    alt: "The Pitt Pirates team with the 2014 North Carolina Regional Chairman's Award",
    caption: "The team at the 2014 North Carolina Regional.",
    source: roboticsTeam.website
  }
];

export type ArchiveVideo = { title: string; href: string; description: string; credit?: string };

export const archiveVideos: ArchiveVideo[] = [
  { title: "2018 Championship: Turing semifinal tiebreaker", href: youtubeWatchUrl("oVavO59NeDs"), description: "A 408-220 alliance win that took Riptide to the division finals.", credit: "FIRST Robotics Competition" },
  { title: "2018 UNC Pembroke: Final 2", href: youtubeWatchUrl("p_e_RpT-vnY"), description: "A 471-220 alliance win to finish the event undefeated.", credit: "FIRST North Carolina" },
  { title: "2017 season leading to World Championship", href: youtubeWatchUrl("B4OKe2IWJcg"), description: "The Pitt Pirates' season recap." },
  { title: "Gemini unveiling", href: youtubeWatchUrl("F51RatuKock"), description: "The team's 2017 robot reveal." },
  { title: "2017 Chairman's Award video", href: youtubeWatchUrl("cc83lHpkctc"), description: "The team's outreach and community story." }
];
