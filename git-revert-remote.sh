#!/bin/bash

# Script to revert local changes to match remote repository state
# For Chrome Extension: Google Translate Scraper
# With ability to exclude specific files from being reverted

# Set colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Git Selective Revert to Remote State Tool ===${NC}"
echo -e "${RED}WARNING: This script will discard local changes for non-excluded files!${NC}"

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository.${NC}"
    exit 1
fi

# Check if remote is configured
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if [[ $? -ne 0 ]]; then
    echo -e "${RED}Error: No remote repository configured.${NC}"
    echo -e "${YELLOW}Please add a remote with: git remote add origin <your-repo-url>${NC}"
    exit 1
fi

echo -e "${BLUE}Remote repository: ${REMOTE_URL}${NC}"

# Get current branch
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
if [[ $? -ne 0 ]]; then
    echo -e "${RED}Error: Not on any branch (detached HEAD).${NC}"
    exit 1
fi

echo -e "${BLUE}Current branch: ${CURRENT_BRANCH}${NC}"

# Fetch the latest from remote
echo -e "${BLUE}Fetching latest changes from remote...${NC}"
git fetch origin
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to fetch from remote. Check your internet connection.${NC}"
    exit 1
fi

# Check if the branch exists on remote
git rev-parse --verify origin/$CURRENT_BRANCH > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Branch '$CURRENT_BRANCH' does not exist on remote.${NC}"
    echo -e "${YELLOW}Available remote branches:${NC}"
    git branch -r | grep origin/ | grep -v HEAD | sed 's/origin\///'
    exit 1
fi

# Show what changes will be discarded
echo -e "${BLUE}The following local changes will be discarded:${NC}"
echo ""
echo -e "${YELLOW}Uncommitted changes:${NC}"
git status --short

echo ""
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$CURRENT_BRANCH)
if [ "$LOCAL" != "$REMOTE" ]; then
    echo -e "${YELLOW}Commits that differ from remote:${NC}"
    git log --oneline --graph --decorate origin/$CURRENT_BRANCH..$CURRENT_BRANCH
    if [ $? -eq 0 ]; then
        echo -e "${YELLOW}Remote commits not in local:${NC}"
        git log --oneline --graph --decorate $CURRENT_BRANCH..origin/$CURRENT_BRANCH
    fi
fi

# Get list of changed files (both tracked and untracked)
CHANGED_FILES=$(git status --porcelain | awk '{if($2!="") print $2; else print $1}' | sort -u)

if [ -z "$CHANGED_FILES" ] && [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${GREEN}Already up to date with remote. Nothing to revert.${NC}"
    exit 0
fi

# Create arrays to store files to exclude
declare -a EXCLUDED_FILES

echo ""
echo -e "${BLUE}Select files/directories to EXCLUDE from revert operation:${NC}"
echo -e "${YELLOW}(Enter numbers separated by spaces, or 'all' to exclude all, or 'none' to exclude none)${NC}"

# List files with numbers
if [ -n "$CHANGED_FILES" ]; then
    i=1
    for file in $CHANGED_FILES; do
        echo "$i) $file"
        i=$((i+1))
    done

    # Prompt user to select files to exclude
    read -r SELECTION

    # Process selection
    if [[ "$SELECTION" == "all" ]]; then
        # Exclude all files
        EXCLUDED_FILES=($CHANGED_FILES)
    elif [[ "$SELECTION" != "none" ]]; then
        # Process selected file numbers
        for num in $SELECTION; do
            if [[ "$num" =~ ^[0-9]+$ ]]; then
                file_index=$((num-1))
                file_array=($CHANGED_FILES)
                if [ "$file_index" -lt "${#file_array[@]}" ]; then
                    EXCLUDED_FILES+=("${file_array[$file_index]}")
                fi
            fi
        done
    fi
fi

# Show excluded files
if [ ${#EXCLUDED_FILES[@]} -gt 0 ]; then
    echo ""
    echo -e "${GREEN}The following files will be EXCLUDED from revert (preserved):${NC}"
    for file in "${EXCLUDED_FILES[@]}"; do
        echo "- $file"
    done
fi

echo ""
echo -e "${RED}WARNING: All local changes except excluded files will be lost and the branch will be reset to match origin/$CURRENT_BRANCH.${NC}"
echo -e "${YELLOW}Are you sure you want to proceed? (y/n)${NC}"
read -r PROCEED

if [[ "$PROCEED" != "y" && "$PROCEED" != "Y" ]]; then
    echo -e "${YELLOW}Operation cancelled.${NC}"
    exit 0
fi

# Backup excluded files
TEMP_DIR=$(mktemp -d)
echo -e "${BLUE}Backing up excluded files to $TEMP_DIR...${NC}"

# First backup all excluded files
for file in "${EXCLUDED_FILES[@]}"; do
    if [ -e "$file" ]; then
        # Create directory structure if needed
        mkdir -p "$TEMP_DIR/$(dirname "$file")" 2>/dev/null
        cp -a "$file" "$TEMP_DIR/$(dirname "$file")/" 2>/dev/null
        echo "Backed up: $file"
    fi
done

# Reset to match remote branch
echo -e "${BLUE}Resetting to match remote branch...${NC}"
git reset --hard origin/$CURRENT_BRANCH
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to reset to remote branch.${NC}"
    echo -e "${YELLOW}Your backed up files are in: $TEMP_DIR${NC}"
    exit 1
fi

# Clean untracked files but restore excluded ones
if [ ${#EXCLUDED_FILES[@]} -gt 0 ]; then
    echo -e "${BLUE}Cleaning untracked files and restoring excluded files...${NC}"
    
    # Clean everything first
    git clean -fd
    
    # Now restore the excluded files from backup
    echo -e "${BLUE}Restoring excluded files from backup...${NC}"
    for file in "${EXCLUDED_FILES[@]}"; do
        if [ -e "$TEMP_DIR/$file" ]; then
            # Create directory structure if needed
            mkdir -p "$(dirname "$file")" 2>/dev/null
            cp -a "$TEMP_DIR/$file" "$(dirname "$file")/" 2>/dev/null
            echo "Restored: $file"
        fi
    done
else
    # No exclusions, clean everything
    echo -e "${YELLOW}Do you want to remove all untracked files? (y/n)${NC}"
    read -r CLEAN
    if [[ "$CLEAN" == "y" || "$CLEAN" == "Y" ]]; then
        git clean -fd
    fi
fi

# Verify that local matches remote (for non-excluded files)
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$CURRENT_BRANCH)
if [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${GREEN}Success! Local branch now matches remote (except for excluded files).${NC}"
else
    echo -e "${RED}Error: Local and remote still don't match after reset.${NC}"
    echo -e "${YELLOW}Your backed up files are in: $TEMP_DIR${NC}"
    exit 1
fi

# Final status
echo -e "${BLUE}Current status:${NC}"
git status --short

echo -e "${GREEN}Selective revert operation completed successfully.${NC}"
echo -e "${BLUE}Temporary backup directory: $TEMP_DIR${NC}"
echo -e "${BLUE}You can remove it when you've verified everything is correct with: rm -rf $TEMP_DIR${NC}"
exit 0