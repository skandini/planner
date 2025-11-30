const difficulties = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
};

const boardEl = document.querySelector("#board");
const difficultyEl = document.querySelector("#difficulty");
const customWidthEl = document.querySelector("#custom-width input");
const customHeightEl = document.querySelector("#custom-height input");
const customMinesEl = document.querySelector("#custom-mines input");
const newGameBtn = document.querySelector("#new-game");
const minesLeftEl = document.querySelector("#mines-left");
const timerEl = document.querySelector("#timer");
const messageEl = document.querySelector("#game-message");

const state = {
  width: 0,
  height: 0,
  mines: 0,
  cells: [],
  flags: 0,
  revealed: 0,
  playing: false,
  timerId: null,
  elapsed: 0,
  firstClick: true,
};

function init() {
  difficultyEl.addEventListener("change", handleDifficultyChange);
  newGameBtn.addEventListener("click", () => startGame(getCurrentSettings()));
  boardEl.addEventListener("contextmenu", (event) => event.preventDefault());
  handleDifficultyChange();
  startGame(getCurrentSettings());
}

function handleDifficultyChange() {
  const isCustom = difficultyEl.value === "custom";
  document.querySelectorAll("#custom-width, #custom-height, #custom-mines").forEach((control) => {
    control.style.display = isCustom ? "flex" : "none";
  });
}

function getCurrentSettings() {
  if (difficultyEl.value === "custom") {
    const width = clamp(parseInt(customWidthEl.value, 10) || 10, 5, 40);
    const height = clamp(parseInt(customHeightEl.value, 10) || 10, 5, 30);
    const maxMines = Math.max(1, width * height - 1);
    const mines = clamp(parseInt(customMinesEl.value, 10) || 15, 1, maxMines);

    customWidthEl.value = width;
    customHeightEl.value = height;
    customMinesEl.value = mines;
    return { width, height, mines };
  }
  return difficulties[difficultyEl.value];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function startGame({ width, height, mines }) {
  clearInterval(state.timerId);
  Object.assign(state, {
    width,
    height,
    mines,
    flags: 0,
    revealed: 0,
    elapsed: 0,
    firstClick: true,
    playing: true,
    cells: Array.from({ length: width * height }, () => ({
      mine: false,
      adjacent: 0,
      revealed: false,
      flagged: false,
    })),
  });

  timerEl.textContent = "0";
  minesLeftEl.textContent = mines;
  messageEl.textContent = "";
  boardEl.style.gridTemplateColumns = `repeat(${width}, 32px)`;
  renderBoard();
}

function renderBoard() {
  boardEl.innerHTML = "";
  state.cells.forEach((cell, idx) => {
    const div = document.createElement("button");
    div.className = "cell";
    div.type = "button";
    div.dataset.index = idx;
    div.setAttribute("aria-label", "Клетка поля");

    if (cell.revealed) {
      div.classList.add("revealed");
      if (cell.mine) {
        div.classList.add("mine");
        div.textContent = "💣";
      } else if (cell.adjacent > 0) {
        div.dataset.value = cell.adjacent;
        div.textContent = cell.adjacent;
      }
    } else if (cell.flagged) {
      div.classList.add("flagged");
      div.textContent = "🚩";
    }

    div.addEventListener("click", () => handleCellClick(idx));
    div.addEventListener("contextmenu", () => toggleFlag(idx));
    boardEl.appendChild(div);
  });
}

function handleCellClick(index) {
  if (!state.playing) return;
  const cell = state.cells[index];
  if (cell.revealed || cell.flagged) return;

  if (state.firstClick) {
    placeMines(index);
    startTimer();
    state.firstClick = false;
  }

  revealCell(index);
}

function toggleFlag(index) {
  if (!state.playing || state.firstClick) return;
  const cell = state.cells[index];
  if (cell.revealed) return;

  cell.flagged = !cell.flagged;
  state.flags += cell.flagged ? 1 : -1;
  minesLeftEl.textContent = Math.max(state.mines - state.flags, 0);
  renderBoard();
}

function placeMines(firstClickIndex) {
  const available = Array.from({ length: state.cells.length }, (_, i) => i).filter(
    (idx) => idx !== firstClickIndex
  );

  for (let placed = 0; placed < state.mines; placed += 1) {
    const pickIndex = Math.floor(Math.random() * available.length);
    const cellIndex = available.splice(pickIndex, 1)[0];
    state.cells[cellIndex].mine = true;
    getNeighbors(cellIndex).forEach((neighbor) => {
      state.cells[neighbor].adjacent += 1;
    });
  }
}

function revealCell(index) {
  const cell = state.cells[index];
  if (cell.revealed || cell.flagged) return;
  cell.revealed = true;
  state.revealed += 1;

  if (cell.mine) {
    endGame(false);
    return;
  }

  if (cell.adjacent === 0) {
    const queue = [index];
    while (queue.length) {
      const current = queue.shift();
      getNeighbors(current).forEach((neighbor) => {
        const neighborCell = state.cells[neighbor];
        if (!neighborCell.revealed && !neighborCell.flagged && !neighborCell.mine) {
          neighborCell.revealed = true;
          state.revealed += 1;
          if (neighborCell.adjacent === 0) queue.push(neighbor);
        }
      });
    }
  }

  if (state.revealed === state.cells.length - state.mines) {
    endGame(true);
  } else {
    renderBoard();
  }
}

function getNeighbors(index) {
  const neighbors = [];
  const { width, height } = state;
  const x = index % width;
  const y = Math.floor(index / width);

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        neighbors.push(ny * width + nx);
      }
    }
  }
  return neighbors;
}

function endGame(isWin) {
  state.playing = false;
  clearInterval(state.timerId);

  state.cells.forEach((cell) => {
    if (cell.mine) cell.revealed = true;
    if (cell.flagged && !cell.mine) cell.revealed = true;
  });

  renderBoard();
  messageEl.textContent = isWin ? "Победа! 🎉" : "Подорвался... 💥";
}

function startTimer() {
  state.elapsed = 0;
  timerEl.textContent = "0";
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    state.elapsed += 1;
    timerEl.textContent = state.elapsed;
  }, 1000);
}

window.addEventListener("load", init);



