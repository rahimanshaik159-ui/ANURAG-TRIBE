// Shared vocabulary: skills/interests (one list, used for profile skills,
// interests, learning goals and "looking for"), departments, Tribe categories, etc.
// Admins can extend skills + categories via settings/taxonomy (see buildTaxonomy).
// Skill ids are slugs. Selecting a skill NEVER grants permissions.

export const SKILL_GROUPS = [
  { id: 'creative', label: 'Creative' },
  { id: 'technology', label: 'Technology' },
  { id: 'business', label: 'Business' },
  { id: 'education', label: 'Education & Career' },
];

const S = (id, label, group, aliases = []) => ({ id, label, group, aliases });
export const DEFAULT_SKILLS = [
  S('video-editing', 'Video Editing', 'creative', ['video editor', 'video editors', 'editor', 'editors', 'editing', 'video']),
  S('filmmaking', 'Filmmaking', 'creative', ['filmmaker', 'filmmakers', 'film maker', 'director', 'film']),
  S('cinematography', 'Cinematography', 'creative', ['cinematographer', 'cinematographers', 'dop']),
  S('photography', 'Photography', 'creative', ['photographer', 'photographers', 'photo']),
  S('acting', 'Acting', 'creative', ['actor', 'actors', 'actress', 'actresses']),
  S('script-writing', 'Script Writing', 'creative', ['script writer', 'script writers', 'scriptwriter', 'screenwriter', 'writer', 'writers']),
  S('graphic-design', 'Graphic Design', 'creative', ['graphic designer', 'graphic designers', 'designer', 'designers', 'design']),
  S('ui-ux-design', 'UI/UX Design', 'creative', ['ui/ux designer', 'ui ux designer', 'ui/ux designers', 'ui designer', 'ux designer', 'ui/ux', 'ui ux', 'figma']),
  S('content-creation', 'Content Creation', 'creative', ['content creator', 'content creators', 'creator', 'youtuber']),
  S('music', 'Music', 'creative', ['musician', 'musicians', 'singer', 'singers', 'audio']),
  S('web-development', 'Web Development', 'technology', ['web developer', 'web developers', 'web dev', 'website developer', 'frontend', 'front end', 'html', 'css']),
  S('app-development', 'App Development', 'technology', ['app developer', 'app developers', 'android developer', 'android', 'kotlin', 'flutter', 'mobile developer']),
  S('ai-ml', 'AI / ML', 'technology', ['ai student', 'ai students', 'ai', 'ml', 'machine learning', 'artificial intelligence', 'deep learning']),
  S('programming', 'Programming', 'technology', ['programmer', 'programmers', 'coder', 'coders', 'coding', 'dsa']),
  S('python', 'Python', 'technology', ['python developer', 'python developers', 'python programmer']),
  S('javascript', 'JavaScript', 'technology', ['javascript developer', 'js developer', 'js', 'node', 'nodejs', 'react']),
  S('java', 'Java', 'technology', ['java developer', 'java developers']),
  S('backend', 'Backend', 'technology', ['backend developer', 'back end', 'api developer', 'firebase']),
  S('data-science', 'Data Science', 'technology', ['data scientist', 'data analyst', 'data analytics']),
  S('cybersecurity', 'Cybersecurity', 'technology', ['cyber security', 'security', 'ethical hacking', 'hacker', 'infosec']),
  S('hardware', 'Hardware', 'technology', ['hardware student', 'electronics', 'embedded', 'arduino']),
  S('iot', 'IoT', 'technology', ['internet of things', 'iot developer']),
  S('game-development', 'Game Development', 'technology', ['game developer', 'game dev', 'unity', 'gamer']),
  S('startup', 'Startup', 'business', ['startups', 'startup minded', 'startup-minded', 'founder', 'founders']),
  S('entrepreneurship', 'Entrepreneurship', 'business', ['entrepreneur', 'entrepreneurs', 'business']),
  S('marketing', 'Marketing', 'business', ['marketer', 'marketers', 'social media', 'branding']),
  S('sales', 'Sales', 'business', ['salesperson']),
  S('management', 'Management', 'business', ['manager', 'managers', 'event management']),
  S('study', 'Study', 'education', ['studying', 'study group', 'exam prep']),
  S('competitive-exams', 'Competitive Exams', 'education', ['gate', 'cat', 'upsc', 'gre', 'competitive exam']),
  S('internships', 'Internships', 'education', ['internship', 'intern']),
  S('jobs', 'Jobs', 'education', ['job', 'job hunting']),
  S('placements', 'Placements', 'education', ['placement', 'campus placement']),
  S('higher-studies', 'Higher Studies', 'education', ['masters', 'ms abroad', 'mba', 'm.tech']),
  S('research', 'Research', 'education', ['researcher', 'research papers']),
];

export const DEPARTMENTS = ['CSE', 'CSE (AI & ML)', 'CSE (Data Science)', 'IT', 'ECE', 'EEE', 'ME', 'CE', 'Pharmacy', 'MBA', 'Other'];
export const YEARS = [
  { value: 1, label: '1st Year' }, { value: 2, label: '2nd Year' },
  { value: 3, label: '3rd Year' }, { value: 4, label: '4th Year' }, { value: 5, label: 'Postgrad / Other' },
];
export const yearLabel = (y) => (YEARS.find((x) => x.value === Number(y)) || {}).label || '';

export const TRIBE_CATEGORIES = [
  { id: 'filmmaking', label: 'Filmmaking', icon: 'film' },
  { id: 'tech', label: 'Tech', icon: 'code' },
  { id: 'startup', label: 'Startup', icon: 'rocket' },
  { id: 'photography', label: 'Photography', icon: 'camera' },
  { id: 'ai-ml', label: 'AI / ML', icon: 'cpu' },
  { id: 'cybersecurity', label: 'Cybersecurity', icon: 'shield' },
  { id: 'competitive-exams', label: 'Competitive Exams', icon: 'award' },
  { id: 'study-group', label: 'Study Group', icon: 'book' },
  { id: 'design', label: 'Design', icon: 'layers' },
  { id: 'music', label: 'Music', icon: 'music' },
  { id: 'content-creation', label: 'Content Creation', icon: 'video' },
  { id: 'entrepreneurship', label: 'Entrepreneurship', icon: 'briefcase' },
  { id: 'research', label: 'Research', icon: 'search' },
  { id: 'other', label: 'Other', icon: 'users' },
];

export const PROJECT_STATUSES = [
  { id: 'idea', label: 'Idea' }, { id: 'planning', label: 'Planning' },
  { id: 'in_progress', label: 'In Progress' }, { id: 'completed', label: 'Completed' }, { id: 'archived', label: 'Archived' },
];
export const PROJECT_CATEGORIES = [
  { id: 'web', label: 'Web App' }, { id: 'mobile', label: 'Mobile App' }, { id: 'ai', label: 'AI / ML' },
  { id: 'iot', label: 'IoT' }, { id: 'hardware', label: 'Hardware' }, { id: 'film', label: 'Short Film' },
  { id: 'photography', label: 'Photography' }, { id: 'design', label: 'Design' }, { id: 'research', label: 'Research' },
  { id: 'startup', label: 'Startup' }, { id: 'creative', label: 'Creative' }, { id: 'event', label: 'College Event' },
  { id: 'other', label: 'Other' },
];
export const POST_CATEGORIES = ['idea', 'project', 'collaboration', 'creation', 'startup', 'opportunity', 'achievement'];
export const RESOURCE_TYPES = [
  { id: 'notes', label: 'Notes', area: 'study' }, { id: 'papers', label: 'Previous Papers', area: 'study' },
  { id: 'course', label: 'Course', area: 'study' }, { id: 'tutorial', label: 'Tutorial', area: 'study' },
  { id: 'internship', label: 'Internship', area: 'career' }, { id: 'job', label: 'Job', area: 'career' },
  { id: 'placement', label: 'Placement', area: 'career' }, { id: 'resume', label: 'Resume', area: 'career' },
  { id: 'interview', label: 'Interview Prep', area: 'career' }, { id: 'guidance', label: 'Career Guidance', area: 'career' },
  { id: 'hackathon', label: 'Hackathon', area: 'opportunity' }, { id: 'competition', label: 'Competition', area: 'opportunity' },
  { id: 'workshop', label: 'Workshop', area: 'opportunity' }, { id: 'scholarship', label: 'Scholarship', area: 'opportunity' },
];
export const EVENT_CATEGORIES = ['hackathon', 'workshop', 'competition', 'cultural', 'creative', 'tribe', 'other'];
export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam' }, { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'inappropriate', label: 'Inappropriate content' }, { id: 'misinformation', label: 'Misinformation' },
  { id: 'privacy', label: 'Privacy concern' }, { id: 'other', label: 'Something else' },
];

export const SOCIAL_PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: 'instagram', hosts: ['instagram.com'], base: 'https://instagram.com/', placeholder: '@username or link' },
  { id: 'youtube', label: 'YouTube', icon: 'youtube', hosts: ['youtube.com', 'youtu.be'], base: 'https://youtube.com/@', placeholder: '@channel or link' },
  { id: 'twitter', label: 'Twitter / X', icon: 'twitter', hosts: ['twitter.com', 'x.com'], base: 'https://x.com/', placeholder: '@handle or link' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'linkedin', hosts: ['linkedin.com'], base: 'https://linkedin.com/in/', placeholder: 'profile link' },
  { id: 'github', label: 'GitHub', icon: 'github', hosts: ['github.com'], base: 'https://github.com/', placeholder: 'username or link' },
  { id: 'portfolio', label: 'Portfolio / Website', icon: 'globe', hosts: null, base: '', placeholder: 'https://your-site.com' },
  { id: 'other', label: 'Other link', icon: 'link', hosts: null, base: '', placeholder: 'https://...' },
];

export const AVATAR_COUNT = 50;
export const avatarIds = () => Array.from({ length: AVATAR_COUNT }, (_, i) => `avatar${i + 1}`);

/** Merge admin-added skills/categories (settings/taxonomy) into the defaults. */
export function buildTaxonomy(extra = {}) {
  const skills = [...DEFAULT_SKILLS];
  for (const s of extra.extraSkills || []) {
    if (s && /^[a-z0-9-]{2,40}$/.test(s.id) && s.label && !skills.some((x) => x.id === s.id)) {
      skills.push({ id: s.id, label: String(s.label).slice(0, 40), group: SKILL_GROUPS.some((g) => g.id === s.group) ? s.group : 'creative', aliases: [] });
    }
  }
  const categories = [...TRIBE_CATEGORIES];
  for (const c of extra.extraCategories || []) {
    if (c && /^[a-z0-9-]{2,30}$/.test(c.id) && c.label && !categories.some((x) => x.id === c.id)) categories.push({ id: c.id, label: String(c.label).slice(0, 30), icon: 'users' });
  }
  const byId = Object.fromEntries(skills.map((s) => [s.id, s]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const label = (id) => (byId[id] ? byId[id].label : id);
  return { skills, byId, categories, catById, label, groups: SKILL_GROUPS };
}
export const DEFAULT_TAXONOMY = buildTaxonomy();
