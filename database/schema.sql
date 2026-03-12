CREATE TABLE universities (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL UNIQUE,
  country VARCHAR(100) NOT NULL DEFAULT 'Malaysia',
  state VARCHAR(255) NULL,
  city VARCHAR(255) NULL,
  website_url VARCHAR(1024) NULL,
  source_type VARCHAR(100) NOT NULL DEFAULT 'official',
  metadata JSON NULL
);

CREATE TABLE courses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  university_id INT UNSIGNED NULL,
  code VARCHAR(255) NULL,
  slug VARCHAR(255) NULL,
  name VARCHAR(255) NOT NULL,
  award_level ENUM(
    'foundation',
    'certificate',
    'diploma',
    'bachelor',
    'master',
    'doctorate',
    'other'
  ) NOT NULL DEFAULT 'other',
  faculty VARCHAR(255) NULL,
  study_mode VARCHAR(100) NULL,
  duration_text VARCHAR(255) NULL,
  duration_semesters INT UNSIGNED NULL,
  intake_text TEXT NULL,
  tuition_text TEXT NULL,
  description TEXT NULL,
  entry_requirements TEXT NULL,
  career_prospects TEXT NULL,
  source_url VARCHAR(512) NULL,
  last_scraped_at DATETIME NULL,
  requirements JSON NULL,
  metadata JSON NULL,
  CONSTRAINT fk_courses_university
    FOREIGN KEY (university_id) REFERENCES universities(id)
    ON DELETE SET NULL
);

CREATE TABLE course_modules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id INT UNSIGNED NOT NULL,
  year_label VARCHAR(100) NULL,
  term_label VARCHAR(100) NULL,
  category VARCHAR(100) NULL,
  code VARCHAR(100) NULL,
  title VARCHAR(255) NOT NULL,
  credits DECIMAL(5, 2) NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  metadata JSON NULL,
  CONSTRAINT fk_course_modules_course
    FOREIGN KEY (course_id) REFERENCES courses(id)
    ON DELETE CASCADE
);
