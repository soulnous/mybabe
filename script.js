const clients = [];

function addClient() {
    const clientName = document.getElementById("clientName").value;
    const licenseNumber = document.getElementById("licenseNumber").value;
    const dueDate = new Date(document.getElementById("dueDate").value);

    clients.push({ clientName, licenseNumber, dueDate });
    displayClients();
    alert("לקוח נוסף בהצלחה!");
}

function displayClients() {
    const clientList = document.getElementById("clientList");
    clientList.innerHTML = "";
    clients.forEach(client => {
        const listItem = document.createElement("li");
        listItem.textContent = `${client.clientName} - מספר זכות: ${client.licenseNumber} - תאריך חיוב: ${client.dueDate.toLocaleDateString()}`;
        clientList.appendChild(listItem);
    });
}

// בדיקה יומית לשליחת תזכורות
function checkForReminders() {
    const today = new Date();
    clients.forEach(client => {
        const timeDiff = client.dueDate - today;
        const daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        if (daysLeft === 1) {
            sendReminder(client.clientName, client.licenseNumber);
        }
    });
}

// פונקציה לדוגמה לשליחת תזכורת (כאן ניתן לשלב שליחת SMS או מייל)
function sendReminder(clientName, licenseNumber) {
    console.log(`תזכורת: ${clientName}, עליך לשלם עבור מספר הזכות: ${licenseNumber}`);
    alert(`תזכורת נשלחה ל-${clientName} עבור תשלום למספר הזכות: ${licenseNumber}`);
}

// קריאה לפונקציה מדי יום (במצב אמיתי ניתן להפעיל אותה אוטומטית בשרת)
setInterval(checkForReminders, 24 * 60 * 60 * 1000); // בדיקה פעם ביום
