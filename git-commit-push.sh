#!/bin/bash

# Script to commit and push changes to Git repository
# For Chrome Extension: Google Translate Scraper

# Set colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Git commit and push process...${NC}"

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository.${NC}"
    exit 1
fi

# Check if remote is configured
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if [[ $? -ne 0 ]]; then
    echo -e "${YELLOW}Warning: No remote repository configured.${NC}"
    echo -e "${YELLOW}You can add one with: git remote add origin <your-repo-url>${NC}"
    PUSH_TO_REMOTE=false
else
    echo -e "${BLUE}Remote repository: ${REMOTE_URL}${NC}"
    PUSH_TO_REMOTE=true
fi

# Show current status
echo -e "${BLUE}Current repository status:${NC}"
git status --short

# Check if there are any changes
if git diff-index --quiet HEAD -- && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    echo -e "${GREEN}No changes to commit.${NC}"
    exit 0
fi

# Show detailed changes
echo ""
echo -e "${BLUE}Detailed changes:${NC}"
echo -e "${YELLOW}Unstaged changes:${NC}"
git diff --stat
echo -e "${YELLOW}Untracked files:${NC}"
git ls-files --others --exclude-standard

echo ""
echo -e "${YELLOW}Do you want to add all changes? (y/n/s for selective)${NC}"
read -r ADD_CHOICE

case $ADD_CHOICE in
    [Yy]* )
        echo -e "${BLUE}Adding all changes...${NC}"
        git add .
        ;;
    [Ss]* )
        echo -e "${BLUE}Starting interactive add...${NC}"
        git add -i
        ;;
    * )
        echo -e "${YELLOW}Skipping add. You can manually add files with 'git add <file>'.${NC}"
        ;;
esac

# Check if there are staged changes
if git diff-index --quiet --cached HEAD --; then
    echo -e "${YELLOW}No staged changes to commit.${NC}"
    exit 0
fi

# Show staged changes
echo -e "${BLUE}Staged changes to be committed:${NC}"
git diff --cached --stat

# Get commit message
echo ""
echo -e "${YELLOW}Enter commit message:${NC}"
read -r COMMIT_MSG

if [ -z "$COMMIT_MSG" ]; then
    echo -e "${RED}Error: Commit message cannot be empty.${NC}"
    exit 1
fi

# Commit changes
echo -e "${BLUE}Committing changes...${NC}"
git commit -m "$COMMIT_MSG"

if [ $? -ne 0 ]; then
    echo -e "${RED}Commit failed.${NC}"
    exit 1
fi

echo -e "${GREEN}Commit successful.${NC}"

# Push to remote if configured
if [ "$PUSH_TO_REMOTE" = true ]; then
    echo ""
    echo -e "${YELLOW}Do you want to push to remote? (y/n)${NC}"
    read -r PUSH_CHOICE
    
    if [[ $PUSH_CHOICE =~ ^[Yy]$ ]]; then
        # Get current branch
        CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
        
        echo -e "${BLUE}Pushing to remote branch '$CURRENT_BRANCH'...${NC}"
        git push origin "$CURRENT_BRANCH"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}Push successful.${NC}"
            
            # Verify sync
            echo -e "${BLUE}Verifying local/remote sync...${NC}"
            git fetch origin
            LOCAL=$(git rev-parse @)
            REMOTE=$(git rev-parse @{u} 2>/dev/null)
            
            if [ "$LOCAL" = "$REMOTE" ]; then
                echo -e "${GREEN}Verification successful: Local repository is in sync with remote.${NC}"
            else
                echo -e "${YELLOW}Warning: Local and remote may not be in sync.${NC}"
            fi
        else
            echo -e "${RED}Push failed. You may need to pull first or check your permissions.${NC}"
            echo -e "${YELLOW}Try running: git pull origin $CURRENT_BRANCH${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}Skipped push to remote.${NC}"
    fi
fi

echo -e "${GREEN}Process completed successfully.${NC}"
exit 0