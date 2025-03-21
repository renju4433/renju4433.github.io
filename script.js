// 解密目标答案（支持汉字）
function getTargetCharacter() {
    const urlParams = new URLSearchParams(window.location.search);
    const encryptedTarget = urlParams.get("target");
    if (!encryptedTarget) {
        return null;
    }
    try {
        return decodeURIComponent(atob(encryptedTarget));
    } catch (e) {
        alert("目标答案解码失败，请检查 URL 参数！");
        return null;
    }
}

// 生成加密 URL（支持汉字）
function generateUrl() {
    const targetInput = document.getElementById("targetInput").value.trim();
    const generatedUrlDiv = document.getElementById("generatedUrl");

    if (targetInput.length === 0 || !isChineseCharacters(targetInput)) {
        generatedUrlDiv.innerHTML = "请输入有效的汉字答案！";
        return;
    }

    const encryptedTarget = btoa(encodeURIComponent(targetInput));
    const baseUrl = window.location.origin + window.location.pathname;
    const url = `${baseUrl}?target=${encryptedTarget}`;
    generatedUrlDiv.innerHTML = `生成的 URL：<a href="${url}" target="_blank">${url}</a>`;
}

// 检查是否为汉字
function isChineseCharacters(str) {
    return /^[\u4e00-\u9fa5]+$/.test(str);
}

// 初始化目标答案
const targetCharacter = getTargetCharacter();
let guessHistory = [];

if (!targetCharacter) {
    document.getElementById("guessSection").style.display = "none";
} else {
    console.log("目标答案（调试用）:", targetCharacter); // 调试用，实际隐藏
    document.getElementById("generateSection").style.display = "none";
    document.getElementById("guessPrompt").innerHTML = `目标答案已加密在 URL 中（${targetCharacter.length}个字），请输入你的猜测！`;
    if (!isChineseCharacters(targetCharacter)) {
        document.getElementById("result").innerHTML = "目标答案必须是汉字，请检查 URL！";
        document.getElementById("guessSection").style.display = "none";
    }
}

// 提交猜测
function submitGuess() {
    if (!targetCharacter) return;

    const guessInput = document.getElementById("guessInput").value.trim();
    const resultDiv = document.getElementById("result");
    const historyList = document.getElementById("historyList");

    // 输入验证
    if (guessInput.length !== targetCharacter.length || !isChineseCharacters(guessInput)) {
        resultDiv.innerHTML = `请输入${targetCharacter.length}个汉字的答案！`;
        return;
    }

    // 检查猜测
    const feedback = checkGuess(guessInput, targetCharacter);
    const htmlFeedback = formatFeedback(feedback);

    // 检查是否猜对
    if (guessInput === targetCharacter) {
        resultDiv.innerHTML = `恭喜你，猜对了！目标答案是：${targetCharacter}`;
        document.getElementById("guessInput").disabled = true;
        document.querySelector("#guessSection button").disabled = true;
    } else {
        resultDiv.innerHTML = htmlFeedback;
    }

    updateHistory(guessInput, feedback, historyList);
    document.getElementById("guessInput").value = ""; // 清空输入框
}

// 检查猜测并返回反馈
function checkGuess(guess, target) {
    const guessChars = guess.split("");
    const targetChars = target.split("");
    const guessPinyin = cnchar.spell(guess, "array", "tone"); // 获取带音调的拼音数组
    const targetPinyin = cnchar.spell(target, "array", "tone");
    const guessPinyin2 = cnchar.spell(guess, "array"); // 获取带音调的拼音数组
    const targetPinyin2 = cnchar.spell(target, "array");
    const guessRadicals = guessChars.map(char => cnchar.radical(char)[0].radical); // 获取偏旁数组
    const targetRadicals = targetChars.map(char => cnchar.radical(char)[0].radical);
    const feedback = Array(target.length).fill({ char: "", status: "" });

    // 第一步：标记正确位置的字
    const usedTarget = Array(target.length).fill(false);
    for (let i = 0; i < target.length; i++) {
        if (guessChars[i] === targetChars[i]) {
            feedback[i] = { char: guessChars[i], status: "correct" };
            usedTarget[i] = true;
        }
    }

    // 第二步：标记存在但位置错误的字
    for (let i = 0; i < target.length; i++) {
        if (feedback[i].status) continue;
        for (let j = 0; j < target.length; j++) {
            if (!usedTarget[j] && guessChars[i] === targetChars[j]) {
                feedback[i] = { char: guessChars[i], status: "present" };
                usedTarget[j] = true;
                break;
            }
        }
    }

    // 第三步：标记读音正确（位置正确）
    const usedPinyin = Array(target.length).fill(false);
    for (let i = 0; i < target.length; i++) {
        if (feedback[i].status) continue;
        if (guessPinyin[i] === targetPinyin[i] && feedback[i].status === "correct") {
            feedback[i].status = "correct-pinyin";
            usedPinyin[i] = true;
        }
    }

    // 第四步：标记存在读音但位置错误的字
    for (let i = 0; i < target.length; i++) {
        if (feedback[i].status) continue;
        for (let j = 0; j < target.length; j++) {
            if (!usedPinyin[j] && guessPinyin[i] === targetPinyin[j]) {
                feedback[i] = { char: guessChars[i], status: "present-pinyin" };
                usedPinyin[j] = true;
                break;
            }
        }
    }
    // 第五步：标记读音仅音调不同（位置正确）
    const usedToneOnly = Array(target.length).fill(false);
    for (let i = 0; i < target.length; i++) {
        if (feedback[i].status) continue;
        if (guessPinyin2[i] === targetPinyin2[i]) {
            feedback[i] = { char: guessChars[i], status: "tone-only-correct" };
            usedToneOnly[i] = true;
        }
    }

    // 第六步：标记存在读音仅音调不同但位置错误
    for (let i = 0; i < target.length; i++) {
        if (feedback[i].status) continue;
        for (let j = 0; j < target.length; j++) {
            if (!usedToneOnly[j] && guessPinyin2[i] === targetPinyin2[j]) {
                feedback[i] = { char: guessChars[i], status: "tone-only-present" };
                usedToneOnly[j] = true;
                break;
            }
        }
    }
    // 第七步：标记偏旁正确（位置正确）
    const usedRadical = Array(target.length).fill(false);
    for (let i = 0; i < target.length; i++) {
        if (feedback[i].status) continue;
        if (guessRadicals[i] === targetRadicals[i] && feedback[i].status === "correct") {
            feedback[i].status = "radical-correct";
            usedRadical[i] = true;
        }
    }

    // 第八步：标记存在偏旁但位置错误
    for (let i = 0; i < target.length; i++) {
        if (feedback[i].status) continue;
        for (let j = 0; j < target.length; j++) {
            if (!usedRadical[j] && guessRadicals[i] === targetRadicals[j]) {
                feedback[i] = { char: guessChars[i], status: "radical-present" };
                usedRadical[j] = true;
                break;
            }
        }
    }

    // 填充未标记的字符
    for (let i = 0; i < target.length; i++) {
        if (!feedback[i].status) {
            feedback[i] = { char: guessChars[i], status: "" };
        }
    }

    return feedback;
}

// 格式化反馈为 HTML
function formatFeedback(feedback) {
    return feedback
        .map(item => `<span class="char ${item.status}">${item.char}</span>`)
        .join("");
}

// 更新猜测历史
function updateHistory(guess, feedback, historyList) {
    guessHistory.push({ guess, feedback });
    const listItem = document.createElement("li");
    listItem.innerHTML = `<strong>猜测：${formatFeedback(feedback)}</strong>`;
    historyList.appendChild(listItem);
    historyList.scrollTop = historyList.scrollHeight; // 自动滚动到最新记录
}
