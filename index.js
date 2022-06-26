// user is prompted via dm for reminder time -OR- user asks for reminder
// user_id and time recorded to reminders_list.json - to be used to reinitialize if server goes down
// user is sent reminder at that time
// standard 12hr clock time is used for user input ie 1:00am
// types of inputs are identified: 
//   6 characters (1:00am) 
//   7 characters (11:00am)
//   other (notice if reminder is too short/long)
// each input type is handled according to how they realted to luxon.js time format

// conversation states:
// 0 = initialized, waiting for timer or user prompt
// 1 = 1st dm sent to user
// 2 = 1st reply sent to bot
// 3 = 2nd dm sent to user
// 4 = 2nd reply sent to bot

const fs = require('fs');
const hl_keywords = require("./hl_keywords.json")
const dialogue = require("./barney_dialogue.json")
const user1 = process.env['user1'];
const BarneyToken = process.env['BarneyToken'];
const Discord = require('discord.js');
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
const luxon = require("luxon");
let conversationState = 0;
var Timer = require("easytimer.js").Timer;
let timer
let minsFinal
let returnTimerHour;
let returnTimerMinutes;
let returnTimerAMorPM;
let numberOfReminders = 0;
let user_id_for_list;
let time_for_list;

const keepAlive = require("./server");
const cron = require('node-cron');

function AutomatedAskForReminderTime() {
  var rand = Math.floor(Math.random() * dialogue["dialogue"].length);
  Barney.users.fetch(user1).then((user) => {
    const DateTime = luxon.DateTime;
    const dt = DateTime.local().setZone('America/New_York');
    const localTime = dt.toFormat('h:mma').toLowerCase();
    user.send(dialogue["dialogue"][rand])
    user.send("What's a good time? Write it like 12:00pm or 1:30am.");
    conversationState = 1;
    } 
  )
}

function AskForReminderTime(msg) {
  console.log("ask");
  const DateTime = luxon.DateTime;
  const dt = DateTime.local().setZone('America/New_York');
  const localTime = dt.toFormat('h:mma').toLowerCase();
  msg.reply("My watch says it's " + localTime + ". What's a good time? (Write it like 12:00pm or 1:30am)");
  conversationState = 1;
}

function ReplyToUserAndConfirmTime(msg) {
  if (conversationState === 1) {
    console.log("reply to user")
    conversationState = 2;
    console.log("change to state 2")
    let dayTemp 
    let result
    let monthTemp 
    const DateTime = luxon.DateTime;
    let currentTime = DateTime.local().setZone('America/New_York') // gets current year, month and day
    // DateTime.fromISO('2017-05-15T17:36')
    if (currentTime.toObject().month.toString().length === 1) {
      monthTemp = "0" + currentTime.toObject().month;
    } else {
      monthTemp = currentTime.toObject().month;
    }
    if (currentTime.toObject().day.toString().length === 1) {
      dayTemp = "0" + currentTime.toObject().day;
    } else {
      dayTemp = currentTime.toObject().day;
    }
    dayTemp = parseInt(dayTemp)
    if (msg.content.length < 6 || msg.content.length > 7) { // gets user input time
      console.log(msg.content.length + " characters.")
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
      }
      return;
    }
    if (msg.content.length === 6) {
      console.log("6 chars")
      digitCheckRegEx = new RegExp(/^[1-9][:][0-5][0-9][a|p][m]/);
      result = digitCheckRegEx.exec(msg.content)
      if (result != null) {
        const DateTime = luxon.DateTime;
        const localTimeB = luxon.DateTime.local().setZone('America/New_York').toFormat('HH:mma').toLowerCase()
        let endTemp
        let currentHours = localTimeB.toString().charAt(0) + localTimeB.toString().charAt(1)
        let currentMinutes = localTimeB.toString().charAt(3) + localTimeB.toString().charAt(4)
        let currentAmOrPm = localTimeB.toString().charAt(5) + 'm'
        let timerHours = msg.content.charAt(0)
        let timerMins = msg.content.charAt(2) + msg.content.charAt(3)
        let timerAmOrPm = msg.content.charAt(4) + msg.content.charAt(5)
        if (timerAmOrPm === "pm" && parseInt(timerHours) != 12) {
          timerHours = parseInt(timerHours) + 12; // adding 12 for pm to 12hr time
        }
        if (timerAmOrPm === "am" && parseInt(timerHours) === 12) {
          timerHours = 0; // setting time to 00 for 12am
          dayTemp += 1
        }
        if (timerAmOrPm === "am" && currentAmOrPm === "pm") {
          dayTemp += 1
        }
        if (currentAmOrPm == timerAmOrPm && timerHours < currentHours) {
          //console.log("this")
          dayTemp += 1
        }
        if (currentAmOrPm == timerAmOrPm && currentHours == timerHours && timerMins <= currentMinutes) {
          //console.log("this too")
          dayTemp += 1
        }
        dayTemp = dayTemp.toString()
        if (dayTemp.length === 1) {
          dayTemp = "0" + dayTemp
        }
        console.log("current: " + currentHours + " " + currentMinutes + currentAmOrPm)
        console.log("timer: " + timerHours + " " + timerMins + timerAmOrPm)
        timerHours = parseInt(timerHours)
        if (timerHours.toString().length === 1) {
          endTemp = currentTime.toObject().year + "-" + monthTemp + "-" + dayTemp + "T" + "0" + timerHours.toString() + ":" + timerMins;
        }
        if (timerHours.toString().length === 2) {
          endTemp = currentTime.toObject().year + "-" + monthTemp + "-" + dayTemp + "T" + timerHours.toString() + ":" + timerMins;
        }
        let end = luxon.DateTime.fromISO(endTemp).setZone('America/New_York')
        let start = DateTime.local().setZone('America/New_York')
        let diffInMinutes = end.diff(start, 'minutes');
        console.log(diffInMinutes.minutes + 240)
        if (diffInMinutes.minutes < 0) {
          Math.floor(diffInMinutes.minutes += 1440);
        }
        returnTimerHour = endTemp.charAt(11) + endTemp.charAt(12);
        returnTimerMinutes = endTemp.charAt(14) + endTemp.charAt(15);
        returnTimerHour = parseInt(returnTimerHour)
        if (returnTimerHour > 0 && returnTimerHour < 12) {
            returnTimerAMorPM = "am";
        }
        if (returnTimerHour > 11) {
          returnTimerAMorPM = "pm";
          returnTimerHour -= 12;
        } else
          if (returnTimerHour == 0) {
            returnTimerHour = 12;
            returnTimerAMorPM = "am";
          }
        let hoursTillRemind = Math.floor((diffInMinutes.minutes + 240) / 60)
        let minutesTillRemind = Math.floor((diffInMinutes.minutes + 240) % 60)
        if (hoursTillRemind > 0) {
          msg.reply(returnTimerHour + ":" + returnTimerMinutes + returnTimerAMorPM + "? " + hoursTillRemind + " hours and " + minutesTillRemind + " minutes from now. Is that right? Yes or No?")
        }
        if (hoursTillRemind === 0) {
          msg.reply(returnTimerHour + ":" + returnTimerMinutes + returnTimerAMorPM + "? " + minutesTillRemind + " minutes from now. Is that right? Yes or No?")
        }
        console.log("current time is: " + localTimeB)
        console.log("timer is set for: " + endTemp)
        console.log("difference in minutes is " + (diffInMinutes.minutes + 240).toString())
        minsFinal = diffInMinutes.minutes + 240
      } else {
        msg.reply("Quit horsing around Gordon, write it right. Or tell me if you want to cancel.");
        conversationState = 1;
      }
    }
    if (msg.content.length === 7) {
      console.log("7 chars")
      digitCheckRegEx = new RegExp(/^[0-1][0-2][:][0-5][0-9][a|p][m]/);
      result = digitCheckRegEx.exec(msg.content)
      if (result != null) {
        const DateTime = luxon.DateTime;
        const localTimeB = luxon.DateTime.local().setZone('America/New_York').toFormat('HH:mma').toLowerCase()
        //console.log(localTimeB)
        let currentAmOrPm = localTimeB.toString().charAt(5) + 'm'
        let currentHours = localTimeB.toString().charAt(0) + localTimeB.toString().charAt(1)
        let currentMinutes = localTimeB.toString().charAt(3) + localTimeB.toString().charAt(4)
        let timerAmOrPm = msg.content.charAt(5) + msg.content.charAt(6)
        let timerHours = msg.content.charAt(0) + msg.content.charAt(1)
        let timerMins = msg.content.charAt(3) + msg.content.charAt(4)
        //console.log(timerAmOrPm)
        //console.log(currentAmOrPm)
        if (timerAmOrPm === "pm" && parseInt(timerHours) != 12) {
          timerHours = parseInt(timerHours) + 12; // adding 12 for pm to 12hr time
        }
        if (timerAmOrPm === "am" && parseInt(timerHours) === 12) {
          timerHours = 0; // setting time to 00 for 12am
          dayTemp += 1
        }
        if (currentAmOrPm == timerAmOrPm && timerHours < currentHours) {
          //console.log(" should add a day")
          dayTemp += 1
        }
        if (currentAmOrPm == timerAmOrPm && currentHours == timerHours && timerMins <= currentMinutes) {
          //console.log(" should also add a day")
          dayTemp += 1
        }
        dayTemp = dayTemp.toString()
        if (dayTemp.length === 1) {
          dayTemp = "0" + dayTemp
        }
        // if (timerAmOrPm === "am" && currentAmOrPm === "pm" && parseInt(timerHours) !== 12) { 
        //   console.log("this")
        //   dayTemp += 1
        // }
        if (timerHours.toString().length === 1) {
          endTemp = currentTime.toObject().year + "-" + monthTemp + "-" + dayTemp + "T" + "0" + timerHours.toString() + ":" + timerMins;
        } 
        if (timerHours.toString().length === 2) {
          endTemp = currentTime.toObject().year + "-" + monthTemp + "-" + dayTemp + "T" + timerHours.toString() + ":" + timerMins;
        }
        if (timerAmOrPm === "am") {
          if (currentAmOrPm === "pm") { 
            dayTemp += 1 // add a day when current time is 'pm' and timer is set for 'am'
          }
        }
        let end = luxon.DateTime.fromISO(endTemp).setZone('America/New_York')
        let start = DateTime.local().setZone('America/New_York')
        let diffInMinutes = end.diff(start, 'minutes');
        //console.log(diffInMinutes)
        //console.log(diffInMinutes.minutes)
        //console.log(parseInt(diffInMinutes.minutes))
        let diff2 = parseInt(diffInMinutes.minutes) + 240
        if (diff2 < 0) {
          diff2 = parseInt(diffInMinutes.minutes) + 240 + 1440
          console.log("diff2 = " + diff2)
        }
        returnTimerHour = endTemp.charAt(11) + endTemp.charAt(12);
        
        returnTimerMinutes = endTemp.charAt(14) + endTemp.charAt(15);
        returnTimerHour = parseInt(returnTimerHour)
        //console.log(returnTimerHour)
        //console.log(returnTimerMinutes)
        
        if (returnTimerHour > 0 && returnTimerHour < 12) {
          returnTimerAMorPM = "am";
        } else 
          if (returnTimerHour > 11) {
            returnTimerAMorPM = "pm";
            returnTimerHour -= 12;
          } else
            if (returnTimerHour == 0) {
              returnTimerHour = 12;
              returnTimerAMorPM = "am";
            }
        if (returnTimerHour == 0 && returnTimerAMorPM == "pm") {
          returnTimerHour = 12;
        }
        let hoursTillRemind = Math.floor(diff2 / 60)
        let minutesTillRemind = diff2 % 60
        if (hoursTillRemind > 0) {
          msg.reply(returnTimerHour + ":" + returnTimerMinutes + returnTimerAMorPM + "? " + hoursTillRemind + " hours and " + minutesTillRemind + " minutes from now. Is that right? Yes or No?")
        }
        if (hoursTillRemind === 0) {
          msg.reply(returnTimerHour + ":" + returnTimerMinutes + returnTimerAMorPM + "? " + minutesTillRemind + " minutes from now. Is that right? Yes or No?")
        }
        console.log("current time is: " + localTimeB)
        console.log("timer is set for: " + endTemp)
        console.log("difference in minutes is " + diff2)
        minsFinal = diff2
      } else {
        msg.reply("Quit horsing around Gordon, write it right. Or tell me if you want to cancel.");
        conversationState = 1;
      }
    }
  }
}

function UserConfirmsOrDeniesReminder(msg,minsFinal) {
  console.log("user confirms or denies reminder")
  if (msg.channel.type == "DM" && !msg.author.bot) {
    if (msg.content.toLowerCase().startsWith("y")) {
      console.log("yes");
      msg.reply("OK.")
      // check how many timers are in reminders_list, increment "tmr" + number of timers
      numberOfReminders += 1
      let tmr = new Timer();
      tmr.start({countdown: true, startValues: {minutes: minsFinal}});
      tmr.addEventListener('secondsUpdated', function (e) {});
      tmr.addEventListener('targetAchieved', function (e) {
        msg.reply("Time to get goin'.");
        conversationState = 0;
      });
      conversationState = 3;
      console.log("reminder set");
      const data = fs.readFileSync('reminder_list.json');
const reminders = JSON.parse(data);

    }
    if (msg.content.startsWith("n")) {
      console.log("no");
      msg.reply("Let me know if you change your mind.")
      conversationState = 0;
    }
  }
}

Barney.on('messageCreate',  msg => {
  if (msg.author.bot) {
    return;
  }
  
  console.log("msg rc .. conversation state = " + conversationState)
  if (msg.channel.type == "DM" && !msg.author.bot) {
    if (conversationState === 0) {
      if (msg.content.toLowerCase().includes("remind")) {
        console.log("reminder requested")
        AskForReminderTime(msg);
        return;
      }
    }
    if (conversationState === 1) {
      if (msg.content.toLowerCase().includes("cancel")) {
        msg.reply("Cancelled.")
        return;
      }
      ReplyToUserAndConfirmTime(msg)
      return;
    }
    if (conversationState === 2) {
      console.log("state 2");
      UserConfirmsOrDeniesReminder(msg,minsFinal);
      return;
    }
    if (conversationState === 3) {
      if (msg.content.toLowerCase().includes("remind")) {
        console.log("too many reminder requests");
        msg.reply("Gordon I'm already reminding you about something at " + returnTimerHour + ":" + returnTimerMinutes + returnTimerAMorPM + "! Do you want to cancel that?")
        conversationState = 4;
        return;
      }
      if (msg.content.toLowerCase().includes("cancel")) {
        msg.reply("You want to cancel your reminder at " + returnTimerHour + ":" + returnTimerMinutes + returnTimerAMorPM + "?");
        conversationState = 4;
        return;
      }
    }
    if (conversationState === 4) {
      if (msg.content.toLowerCase().startsWith("y")) {
        msg.reply("Fine. Let me know if you change your mind.");
        conversationState = 0;
        timer.removeAllEventListeners();
        return;
      }
      if (msg.content.toLowerCase().includes("cancel")) {
        msg.reply("Fine. Let me know if you change your mind.");
        conversationState = 0;
        return;
      }
      if (msg.content.toLowerCase().startsWith("n")) {
        msg.reply("Ok.");
        conversationState = 3;
        return;
      }
    }
  }
}
);

Barney.on("ready", () => {
  //console.log("conversation state = " + conversationState)
  console.log("app ready")
  //AutomatedAskForReminderTime();
  cron.schedule('1 2 * * *', () => {
  // AutomatedAskForReminderTime();
  // },
  // {
  //   timezone: "America/New_York"
  })
});

Barney.login(BarneyToken);

console.log("test")

//keepAlive();