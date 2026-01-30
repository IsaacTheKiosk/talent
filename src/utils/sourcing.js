/**
 * Sourcing utilities - Generate LinkedIn X-ray searches from job descriptions
 */

// Common job title variations
const TITLE_VARIATIONS = {
  'software engineer': ['software engineer', 'software developer', 'swe', 'backend engineer', 'frontend engineer', 'full stack engineer', 'fullstack developer'],
  'backend engineer': ['backend engineer', 'backend developer', 'server engineer', 'api developer', 'node.js engineer', 'python developer', 'java developer'],
  'frontend engineer': ['frontend engineer', 'frontend developer', 'ui engineer', 'react developer', 'vue developer', 'angular developer'],
  'full stack': ['full stack engineer', 'fullstack developer', 'full-stack engineer', 'web developer'],
  'product manager': ['product manager', 'pm', 'product lead', 'product owner'],
  'product designer': ['product designer', 'ux designer', 'ui designer', 'ui/ux designer', 'ux/ui designer'],
  'data scientist': ['data scientist', 'ml engineer', 'machine learning engineer', 'ai engineer', 'data analyst'],
  'data engineer': ['data engineer', 'data platform engineer', 'etl developer', 'analytics engineer'],
  'devops': ['devops engineer', 'sre', 'site reliability engineer', 'platform engineer', 'infrastructure engineer'],
  'engineering manager': ['engineering manager', 'eng manager', 'software engineering manager', 'tech lead', 'technical lead'],
  'recruiter': ['recruiter', 'talent acquisition', 'ta specialist', 'sourcer', 'recruiting coordinator'],
};

// Common skills by role type
const ROLE_SKILLS = {
  'backend': ['node.js', 'python', 'java', 'go', 'golang', 'ruby', 'scala', 'rust', 'api', 'microservices', 'aws', 'gcp', 'docker', 'kubernetes'],
  'frontend': ['react', 'vue', 'angular', 'typescript', 'javascript', 'css', 'html', 'next.js', 'redux', 'graphql'],
  'fullstack': ['react', 'node.js', 'typescript', 'python', 'aws', 'mongodb', 'postgresql', 'graphql'],
  'data': ['python', 'sql', 'spark', 'tensorflow', 'pytorch', 'pandas', 'sklearn', 'airflow', 'snowflake', 'bigquery'],
  'devops': ['aws', 'gcp', 'azure', 'terraform', 'kubernetes', 'docker', 'ci/cd', 'jenkins', 'github actions'],
  'product': ['agile', 'scrum', 'roadmap', 'strategy', 'analytics', 'a/b testing', 'user research'],
  'design': ['figma', 'sketch', 'adobe xd', 'user research', 'prototyping', 'design systems', 'accessibility'],
};

/**
 * Parse a job description and extract key information
 */
export function parseJobDescription(text) {
  const lowercaseText = text.toLowerCase();

  const result = {
    titles: [],
    skills: [],
    locations: [],
    companies: [],
    experience: null,
    roleType: null
  };

  // Detect role type
  if (lowercaseText.includes('backend') || lowercaseText.includes('server') || lowercaseText.includes('api')) {
    result.roleType = 'backend';
  } else if (lowercaseText.includes('frontend') || lowercaseText.includes('ui engineer') || lowercaseText.includes('react')) {
    result.roleType = 'frontend';
  } else if (lowercaseText.includes('full stack') || lowercaseText.includes('fullstack')) {
    result.roleType = 'fullstack';
  } else if (lowercaseText.includes('data scientist') || lowercaseText.includes('machine learning') || lowercaseText.includes('ml engineer')) {
    result.roleType = 'data';
  } else if (lowercaseText.includes('devops') || lowercaseText.includes('sre') || lowercaseText.includes('platform')) {
    result.roleType = 'devops';
  } else if (lowercaseText.includes('product manager') || lowercaseText.includes('product lead')) {
    result.roleType = 'product';
  } else if (lowercaseText.includes('designer') || lowercaseText.includes('ux') || lowercaseText.includes('ui/ux')) {
    result.roleType = 'design';
  }

  // Extract titles mentioned
  Object.entries(TITLE_VARIATIONS).forEach(([key, variations]) => {
    variations.forEach(title => {
      if (lowercaseText.includes(title.toLowerCase())) {
        if (!result.titles.includes(title)) {
          result.titles.push(title);
        }
      }
    });
  });

  // Extract skills mentioned
  const allSkills = Object.values(ROLE_SKILLS).flat();
  allSkills.forEach(skill => {
    if (lowercaseText.includes(skill.toLowerCase())) {
      if (!result.skills.includes(skill)) {
        result.skills.push(skill);
      }
    }
  });

  // If no skills found but we know the role type, add common skills
  if (result.skills.length === 0 && result.roleType && ROLE_SKILLS[result.roleType]) {
    result.skills = ROLE_SKILLS[result.roleType].slice(0, 5);
  }

  // Extract locations
  const locationPatterns = [
    /(?:in|based in|located in|location:?)\s*([A-Z][a-zA-Z\s,]+?)(?:\.|,|$|\n)/gi,
    /(san francisco|sf|bay area|new york|nyc|los angeles|la|seattle|austin|boston|chicago|denver|remote|hybrid)/gi
  ];

  locationPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleaned = match.replace(/(?:in|based in|located in|location:?)\s*/gi, '').trim();
        if (cleaned && !result.locations.includes(cleaned)) {
          result.locations.push(cleaned);
        }
      });
    }
  });

  // Extract experience level
  const expMatch = text.match(/(\d+)\+?\s*(?:years?|yrs?)/i);
  if (expMatch) {
    result.experience = parseInt(expMatch[1]);
  }

  // Extract company types/names mentioned
  const companyPatterns = [
    /(startup|scale-up|enterprise|fortune 500|faang|big tech)/gi,
    /(?:experience at|worked at|background in)\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/g
  ];

  companyPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleaned = match.replace(/(?:experience at|worked at|background in)\s*/gi, '').trim().toLowerCase();
        if (cleaned && !result.companies.includes(cleaned)) {
          result.companies.push(cleaned);
        }
      });
    }
  });

  return result;
}

/**
 * Generate LinkedIn X-ray search queries
 */
export function generateSearchQueries(parsedJD, customOptions = {}) {
  const queries = [];
  const { titles, skills, locations, companies } = parsedJD;

  // Use custom options or defaults
  const options = {
    excludeOpenToWork: customOptions.excludeOpenToWork ?? true,
    includePassive: customOptions.includePassive ?? true,
    ...customOptions
  };

  // Base search template
  const baseUrl = 'https://www.google.com/search?q=';
  const siteFilter = 'site:linkedin.com/in';
  const excludeOTW = options.excludeOpenToWork ? ' -"open to work"' : '';

  // Generate title-based searches
  if (titles.length > 0) {
    // Primary title search
    const titleQuery = titles.slice(0, 3).map(t => `"${t}"`).join(' OR ');
    const locationQuery = locations.length > 0 ? ` AND "${locations[0]}"` : '';

    queries.push({
      name: `${titles[0]} ${locations[0] || ''}`.trim(),
      type: 'title',
      query: `${siteFilter} (${titleQuery})${locationQuery}${excludeOTW}`,
      description: 'Primary title search'
    });
  }

  // Generate skill-based searches
  if (skills.length > 0) {
    const topSkills = skills.slice(0, 3);
    const skillQuery = topSkills.map(s => `"${s}"`).join(' AND ');
    const titlePart = titles.length > 0 ? ` AND ("${titles[0]}")` : '';
    const locationQuery = locations.length > 0 ? ` AND "${locations[0]}"` : '';

    queries.push({
      name: `${topSkills.join(' + ')}`,
      type: 'skills',
      query: `${siteFilter} (${skillQuery})${titlePart}${locationQuery}${excludeOTW}`,
      description: 'Skills-focused search'
    });
  }

  // Generate company-type searches
  if (companies.length > 0 && titles.length > 0) {
    const companyQuery = companies[0];
    const titleQuery = `"${titles[0]}"`;
    const locationQuery = locations.length > 0 ? ` AND "${locations[0]}"` : '';

    queries.push({
      name: `${titles[0]} @ ${companies[0]}`,
      type: 'company',
      query: `${siteFilter} (${titleQuery}) AND "${companyQuery}"${locationQuery}${excludeOTW}`,
      description: 'Company background search'
    });
  }

  // Generate location variations if multiple locations
  if (locations.length > 1 && titles.length > 0) {
    const titleQuery = `"${titles[0]}"`;
    locations.slice(1, 3).forEach(loc => {
      queries.push({
        name: `${titles[0]} in ${loc}`,
        type: 'location',
        query: `${siteFilter} (${titleQuery}) AND "${loc}"${excludeOTW}`,
        description: `Location: ${loc}`
      });
    });
  }

  // Add a broader "passive candidates" search
  if (options.includePassive && titles.length > 0) {
    const titleQuery = `"${titles[0]}"`;
    const skillPart = skills.length > 0 ? ` AND "${skills[0]}"` : '';

    queries.push({
      name: `Passive ${titles[0]}s`,
      type: 'passive',
      query: `${siteFilter} (${titleQuery})${skillPart} -"seeking" -"looking for" -"open to"${excludeOTW}`,
      description: 'Passive candidates only'
    });
  }

  return queries;
}

/**
 * Build the full Google search URL
 */
export function buildSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Quick search templates for common roles
 */
export const QUICK_SEARCHES = {
  'Software Engineer': {
    titles: ['software engineer', 'software developer'],
    skills: ['javascript', 'python', 'react', 'node.js'],
    roleType: 'fullstack'
  },
  'Backend Engineer': {
    titles: ['backend engineer', 'backend developer'],
    skills: ['python', 'java', 'go', 'node.js', 'api'],
    roleType: 'backend'
  },
  'Frontend Engineer': {
    titles: ['frontend engineer', 'frontend developer'],
    skills: ['react', 'typescript', 'javascript', 'css'],
    roleType: 'frontend'
  },
  'Product Manager': {
    titles: ['product manager', 'product lead'],
    skills: ['roadmap', 'strategy', 'agile'],
    roleType: 'product'
  },
  'Product Designer': {
    titles: ['product designer', 'ux designer', 'ui/ux designer'],
    skills: ['figma', 'user research', 'prototyping'],
    roleType: 'design'
  },
  'Data Scientist': {
    titles: ['data scientist', 'ml engineer'],
    skills: ['python', 'machine learning', 'tensorflow', 'sql'],
    roleType: 'data'
  },
  'DevOps Engineer': {
    titles: ['devops engineer', 'sre', 'platform engineer'],
    skills: ['aws', 'kubernetes', 'terraform', 'docker'],
    roleType: 'devops'
  }
};
