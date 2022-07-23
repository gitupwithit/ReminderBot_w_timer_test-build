// test build

// user is prompted via dm for reminder time -OR- user asks for reminder with keyword 'remind' in dm
// users who are to prompted are stored in replit 'secrets' for security sake until a better solution is found
// user_id and time recorded to reminders_list.json to be used to reinitialize if server goes down
// user is sent reminder at that time using easytimer.js
// standard 12hr clock time is used for user input (eg 12:01am-12:59pm)
// types of inputs are identified: 
//  // 6 characters (1:00am) 
//  // 7 characters (11:00am)
//  // other (user notified if reminder request is unreadable)
// timerTime variable is created by taking the time from the user input (hours/mins) and combining that with the year-month-date from the currentTime + time zone adjustment
// current script is set up for New York time
// if necessary, a day is added to the timerTime
// difference in time from current till reminder is handled by luxon.js requiring formatting
// bot messages are preceeded with flarour test from barney_dialogue.json
//
// note: reminders are assumed to be within the following 24 hours
//
// conversation states: (required for managing input)
// 0 = initialized, waiting for user prompt -AND/OR- waiting to send automated prompt 
// 1 = user has sent request to begin reminder process
// 2 = reminder prompt has been sent to user
// 3 = user has sent reminder request time
// 4 = user has been prompted to confirm time
// 5 = time confirmed, reminder is set

const fs = require('fs');
const keepAlive = require("./server");
const cron = require('node-cron');
const Discord = require('discord.js');
const Timer = require("easytimer.js").Timer;
const luxon = require("luxon");
const hl_keywords = require("./hl_keywords.json")
const dialogue = require("./barney_dialogue.json")
const user1 = process.env['user1'];
const BarneyToken = process.env['BarneyToken'];
const { Client, Intents } = require('discord.js');
const Barney = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_MESSAGE_TYPING,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
    Intents.FLAGS.DIRECT_MESSAGE_TYPING,
  ],
  partials: [
    'CHANNEL',
  ]
});

let conversationState = 0;
let minutesTillReminder;
let numberOfReminders;
let requestedTime;
let returnTimerHour;
let returnTimerMinutes;
let returnTimerAMorPM;
let time_for_list;
let timerHours;
let timerMins;
let timerAmOrPm;
let tmr;
let user_id_for_list;

// gets current day/time
// time zone assumed to be America/New_York
// converts reminder time to 24hr time
// calculates time until reminder

function ConvertTo24HrTime(msg) {
  // get current day and month (so that day can be incrimented if needed)
  let currentTime = luxon.DateTime.local().setZone('America/New_York').toISO() // gets current date and time
  let currentYear = currentTime.charAt(0) + currentTime.charAt(1) + currentTime.charAt(2) + currentTime.charAt(3)
  let currentMonth = currentTime.charAt(5) + currentTime.charAt(6)
  let currentDay = parseInt(currentTime.charAt(8) + currentTime.charAt(9))
  let currentHours = currentTime.charAt(11) + currentTime.charAt(12)
  let currentMinutes = currentTime.charAt(14) + currentTime.charAt(15)
  let currentAmOrPm = luxon.DateTime.local().setZone('America/New_York').toFormat('HH:mma').toLowerCase().toString().charAt(5) + 'm'

  if (msg.content.length === 6) { // input time is 6 or 7 characters
    // parse timer from input message
    timerHours = "0" + msg.content.charAt(0)
    timerMins = msg.content.charAt(2) + msg.content.charAt(3)
    timerAmOrPm = msg.content.charAt(4) + msg.content.charAt(5)
  }
  if (msg.content.length === 7) {
    timerHours = msg.content.charAt(0) + msg.content.charAt(1)
    timerMins = msg.content.charAt(3) + msg.content.charAt(4)
    timerAmOrPm = msg.content.charAt(5) + msg.content.charAt(6)
  }
  if (timerAmOrPm === "pm" && parseInt(timerHours) != 12) {
    timerHours = parseInt(timerHours) + 12; // adding 12 for pm to 12hr time unless it is 12pm
  }
  if (timerHours.toString().length === 1) {
    timerHours = "0" + timerHours.toString()
  }
  if (timerAmOrPm === "am" && timerHours == 12) {
    timerHours = "00"; // setting time to 00 for 12am
  }
  if (timerAmOrPm === "am" && currentAmOrPm === "pm") {
    currentDay += 1; // when timer time has lower values, a day is added to timer time so that when luxon doesn't return a negative value when calculating time difference
  }
  if (currentAmOrPm == timerAmOrPm && timerHours < currentHours) {
    currentDay += 1;
  }
  if (currentAmOrPm == timerAmOrPm && currentHours == timerHours && timerMins <= currentMinutes) {
    currentDay += 1
  }
  currentDay = currentDay.toString()
  let timerTime = currentYear + "-" + currentMonth + "-" + currentDay + "T" + timerHours + ":" + timerMins + "-04:00"; // currentDay Y-M-D + timer H-M + time zone
  let diffInMinutes = luxon.DateTime.fromISO(timerTime).diff(luxon.DateTime.fromISO(currentTime), 'minutes'); // calculation of difference in time from now till reminder
  if (diffInMinutes.minutes < 0) {
    console.log("difference is negative, shouldn't happen!")
    Math.floor(diffInMinutes.minutes += 1440); // add 24 hours
  }
  if (diffInMinutes === 0) { // if the timer is scheduled immediately, this should only actually happen from user error
    msg.reply("That's right now Gordon.");
    conversationState = 0;
    return;
  }
  let hoursTillRemind = Math.floor((diffInMinutes.minutes) / 60)
  let minutesTillRemind = Math.floor((diffInMinutes.minutes) % 60)
  // confirmation message sent to user
  if (timerHours === "00") {
    timerHours = 12;
  }
  if (hoursTillRemind > 0) {
    msg.reply(timerHours + ":" + timerMins + timerAmOrPm + "? " + hoursTillRemind + " hours and " + minutesTillRemind + " minutes from now. Is that right? Yes or No?")
  }
  if (hoursTillRemind === 0) {
    msg.reply(timerHours + ":" + timerMins + timerAmOrPm + "? " + minutesTillRemind + " minutes from now. Is that right? Yes or No?")
  }
  minutesTillReminder = diffInMinutes
  conversationState = 3
}

function AutomatedAskForReminderTime() { // has flavour text
  var rand = Math.floor(Math.random() * dialogue["dialogue"].length);
  Barney.users.fetch(user1).then((user) => {
    const DateTime = luxon.DateTime;
    const dt = DateTime.local().setZone('America/New_York');
    const localTime = dt.toFormat('h:mma').toLowerCase();
    user.send(dialogue["dialogue"][rand])
    user.send("What's a good time? Write it like 12:00pm or 1:30am.");
    conversationState = 2;
  }
  )
}

function AskForReminderTime(msg) { // no flavour text
  const DateTime = luxon.DateTime;
  const dt = DateTime.local().setZone('America/New_York');
  const localTime = dt.toFormat('h:mma').toLowerCase();
  msg.reply("My watch says it's " + localTime + ". What's a good time? (Write it like 12:00pm or 1:30am)");
  conversationState = 2;
}

// assesses time requested by user. either sends user a prompt to confirm -OR- sends notice that the time request format is incorrect
function ProcessTimeRequested(msg) {
  conversationState = 1;
  let result; // assess that reminder request is correct
  if (msg.content.length < 6 || msg.content.length > 7) { // time request format is incorrect
    if (msg.content.length == 1) {
      digitCheckRegEx = new RegExp(/^[1-9]/);
      result = digitCheckRegEx.exec(msg.content)
      if (result != null) {
        msg.reply(msg.content + ":00AM? " + msg.content + ":00PM? What do you mean Gordon??")
        conversationState = 1;
        return;
      }
      msg.reply("Quit horsing around Gordon. Write it like 1:00am. Or tell me if you want to cancel.");
      conversationState = 1;
      return;
    }
  }

  if (msg.content.length === 6) {
    digitCheckRegEx = new RegExp(/^[1-9][:][0-5][0-9][a|p][m]/); // time format
    result = digitCheckRegEx.exec(msg.content)
  }
  if (msg.content.length === 7) {
    digitCheckRegEx = new RegExp(/^[0-1][0-2][:][0-5][0-9][a|p][m]/);
    result = digitCheckRegEx.exec(msg.content)
  }
  if (result == null) {
    msg.reply("Quit horsing around Gordon. Write it like 1:00am. Or tell me if you want to cancel.");
    conversationState = 1;
    return;
  }
  if (result != null) {
    ConvertTo24HrTime(msg) // remiinder time requested in correct format, gets converted to 24 hr
  }
}

function SetUpReminder(msg, reminderTime) {
  // check how many timers are in reminders_list, increment "tmr" + number of timers
  const reminderData = fs.readFileSync('reminder_list.json');
  let reminders = JSON.parse(reminderData);
  // numberOfReminders = Object.keys(reminders).length;
  // console.log(numberOfReminders);
  let id = msg.author.id
  let toAdd = {id : reminderTime}
  reminders.push(toAdd)
  tmr = new Timer();
  tmr.start({ countdown: true, startValues: { minutes: minutesTillReminder } });
  tmr.addEventListener('secondsUpdated', function(e) { });
  tmr.addEventListener('targetAchieved', function(e) {
    msg.reply("Time to get goin'.");
    conversationState = 0;
  });
}


// handles message input:
Barney.on('messageCreate', msg => {
  if (msg.author.bot) { return; }
  if (msg.channel.type == "DM" && !msg.author.bot) {
    if (conversationState === 0) {
      if (msg.content.toLowerCase().includes("remind")) {
        AskForReminderTime(msg);
        conversationState = 1;
        return;
      }
    }
    if (conversationState === 1) {
      if (msg.content.toLowerCase().includes("cancel")) {
        msg.reply("Cancelled.")
        conversationState = 0;
        return;
      }
      ProcessTimeRequested(msg)
      return;
    }
    if (conversationState === 2) {
      UserConfirmsOrDeniesReminder(msg, minutesTillReminder);
      return;
    }
    if (conversationState === 3) {
      if (msg.content.toLowerCase().includes("remind")) {
        msg.reply("Gordon I'm already reminding you about something at " + timerHours + ":" + timerMins + timerAmOrPm + "! Do you want to cancel that?")
        conversationState = 4;
        return;
      }
      if (msg.content.toLowerCase().includes("cancel")) {
        msg.reply("You want to cancel your reminder at " + timerHours + ":" + timerMins + timerAmOrPm + "?");
        conversationState = 4;
        return;
      }
      if (msg.content.toLowerCase().startsWith("n")) {
        msg.reply("Ok. Well try typing the time again, or cancel.");
        conversationState = 1;
        return;
      }
      if (msg.content.toLowerCase().startsWith("y")) {
        msg.reply("Ok.");
        reminderTime = timerHours + ":" + timerMins + timerAmOrPm
        SetUpReminder(msg,reminderTime)
        conversationState = 5;
        return;
      }
    }
    if (conversationState === 4) {
      if (msg.content.toLowerCase().includes("remind")) {
        msg.reply("Gordon I'm already reminding you about something at " + timerHours + ":" + timerMins + timerAmOrPm + "! Do you want to cancel that?")
      }
      if (msg.content.toLowerCase().startsWith("y")) {
        msg.reply("Ok.");
        conversationState = 5;
        SetUpReminder(msg, minutesTillReminder)
        return;
      }
      if (msg.content.toLowerCase().includes("cancel")) {
        msg.reply("Fine, I'll cancel it.");
        tmr.removeAllEventListeners();
        conversationState = 0
        return;
      }
      if (msg.content.toLowerCase().startsWith("n")) {
        msg.reply("Ok. Well try typing the time again, or cancel.");
        conversationState = 1;
        return;
      }
    }
    if (conversationState === 5) {
      if (msg.content.toLowerCase().includes("remind")) {
        msg.reply("Gordon I'm already reminding you about something at " + timerHours + ":" + timerMins + timerAmOrPm + "! Do you want to cancel that?")
      }
      if (msg.content.toLowerCase().includes("cancel")) {
        msg.reply("Fine, I'll cancel it.");
        tmr.removeAllEventListeners();
        conversationState = 0
        return;
      }
    }
  }
});

Barney.on("ready", () => {
  //console.log("conversation state = " + conversationState)
  console.log("test build ready");
  //AutomatedAskForReminder();


  cron.schedule('1 2 * * *', () => {
    // AutomatedAskForReminderTime();
    // },
    // {
    //   timezone: "America/New_York"
  })
});

Barney.login(BarneyToken);

//keepAlive();
