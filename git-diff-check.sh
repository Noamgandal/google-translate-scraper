#!/bin/bash

# Script to check if local code differs from Git repository
# For Chrome Extension: Google Translate Scraper

# Set colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Checking for differences between local files and Git repository...${NC}"

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository.${NC}"
    exit 1
fi

# Check if the remote is set
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if [[ $? -ne 0 ]]; then
    echo -e "${YELLOW}Warning: No remote repository configured.${NC}"
else
    echo -e "${BLUE}Remote repository: ${REMOTE_URL}${NC}"
fi

# Step 1: Check for unstaged changes
echo -e "${BLUE}Checking for unstaged changes...${NC}"
if git diff --quiet; then
    echo -e "${GREEN}No unstaged changes found.${NC}"
else
    echo -e "${RED}Unstaged changes found:${NC}"
    git diff --stat
    echo ""
fi

# Step 2: Check for staged changes
echo -e "${BLUE}Checking for staged changes...${NC}"
if git diff --cached --quiet; then
    echo -e "${GREEN}No staged changes found.${NC}"
else
    echo -e "${RED}Staged changes found:${NC}"
    git diff --cached --stat
    echo ""
fi

# Step 3: Check for untracked files
echo -e "${BLUE}Checking for untracked files...${NC}"
UNTRACKED=$(git ls-files --others --exclude-standard)
if [ -z "$UNTRACKED" ]; then
    echo -e "${GREEN}No untracked files found.${NC}"
else
    echo -e "${RED}Untracked files found:${NC}"
    git ls-files --others --exclude-standard
    echo ""
fi

# Step 4: Check for local vs. remote differences (only if remote exists)
if [[ $? -eq 0 && -n "$REMOTE_URL" ]]; then
    echo -e "${BLUE}Checking for differences between local and remote...${NC}"
    git fetch origin > /dev/null 2>&1

    # Get current branch
    CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
    if [[ $? -ne 0 ]]; then
        echo -e "${YELLOW}Not on any branch (detached HEAD).${NC}"
    else
        # Check if there are differences between local and remote
        LOCAL=$(git rev-parse @ 2>/dev/null)
        REMOTE=$(git rev-parse @{u} 2>/dev/null)
        if [ $? -ne 0 ]; then
            echo -e "${YELLOW}Your current branch '$CURRENT_BRANCH' is not tracking a remote branch.${NC}"
        else
            BASE=$(git merge-base @ @{u} 2>/dev/null)

            if [ "$LOCAL" = "$REMOTE" ]; then
                echo -e "${GREEN}Local branch is in sync with remote.${NC}"
            else
                if [ "$LOCAL" = "$BASE" ]; then
                    echo -e "${YELLOW}Remote contains changes that are not in local:${NC}"
                    git log HEAD..@{u} --oneline
                elif [ "$REMOTE" = "$BASE" ]; then
                    echo -e "${YELLOW}Local contains commits that are not pushed to remote:${NC}"
                    git log @{u}..HEAD --oneline
                else
                    echo -e "${RED}Local and remote have diverged.${NC}"
                    echo -e "${YELLOW}Local commits not pushed:${NC}"
                    git log @{u}..HEAD --oneline
                    echo -e "${YELLOW}Remote commits not pulled:${NC}"
                    git log HEAD..@{u} --oneline
                fi
            fi
        fi
    fi
fi

# Summary
echo ""
echo -e "${YELLOW}=============== SUMMARY ===============${NC}"
UNSTAGED=$(git diff --name-only | wc -l)
STAGED=$(git diff --cached --name-only | wc -l)
UNTRACKED_COUNT=$(git ls-files --others --exclude-standard | wc -l)

echo -e "Unstaged changes: ${UNSTAGED}"
echo -e "Staged changes: ${STAGED}"
echo -e "Untracked files: ${UNTRACKED_COUNT}"

if [[ $UNSTAGED -eq 0 && $STAGED -eq 0 && $UNTRACKED_COUNT -eq 0 ]]; then
    if [[ -n "$REMOTE_URL" && "$LOCAL" = "$REMOTE" ]]; then
        echo -e "${GREEN}Everything is up to date!${NC}"
    else
        echo -e "${GREEN}Working directory is clean!${NC}"
    fi
else
    echo -e "${YELLOW}Your repository contains differences.${NC}"
    echo -e "Run './git-commit-push.sh' to commit and push your changes."
fi

echo -e "${GREEN}Check completed.${NC}"
exit 0