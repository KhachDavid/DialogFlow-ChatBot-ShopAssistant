const express = require("express");
const { WebhookClient } = require("dialogflow-fulfillment");
const app = express();
const fetch = require("node-fetch");
const base64 = require("base-64");
const { UNSAFE_NavigationContext, Navigate } = require("react-router");

let username = "";
let password = "";
let token = "";
let current_category = "";
let current_product = undefined;

// I am not using this list to generate tags
// I am using this list to make sure that the current category is a valid category
let listOfCategories = [
  "bottoms",
  "hats",
  "plushes",
  "sweatshirts",
  "tees",
  "leggings",
];

USE_LOCAL_ENDPOINT = false;
// set this flag to true if you want to use a local endpoint
// set this flag to false if you want to use the online endpoint
ENDPOINT_URL = "";
if (USE_LOCAL_ENDPOINT) {
  ENDPOINT_URL = "http://127.0.0.1:5000";
} else {
  ENDPOINT_URL = "http://cs571.cs.wisc.edu:5000";
}

async function getToken() {
  let request = {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + base64.encode(username + ":" + password),
    },
  };

  const serverReturn = await fetch(ENDPOINT_URL + "/login", request);
  const serverResponse = await serverReturn.json();
  token = serverResponse.token;

  return token;
}

app.get("/", (req, res) => res.send("online"));
app.post("/", express.json(), (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });

  async function welcome() {
    current_category = "";
    current_product = undefined;

    deleteAllMessages();
    
    agent.add("Webhook works!");
    addMessage("Webhook works!");
    console.log(ENDPOINT_URL);
  }

  async function login() {
    // You need to set this from `username` entity that you declare in DialogFlow
    username = agent.parameters.username;
    // You need to set this from password entity that you declare in DialogFlow
    password = agent.parameters.password;

    await getToken();

    try {
      agent.add(token);
      agent.add("Login successful");
      addMessage(token);
      addMessage("Login successful");
    } catch (error) {
      agent.add("Login failed");
      agent.add("Username " + username + " or password is incorrect");
      addMessage("Login failed");
      addMessage("Username " + username + " or password is incorrect");
    }
  }

  async function category() {
    navigate(agent.parameters.category, agent);
    agent.add("You are in " + current_category);
  }

  async function tagForCategory() {
    // check if current category is valid
    if (!listOfCategories.includes(current_category)) {
      agent.add("Sorry, I couldn't find any tags for " + current_category);
      addMessage("Sorry, I couldn't find any tags for " + current_category);
      return;
    }

    await findTags(agent);
  }

  async function fallback() {
    current_product = undefined;
    current_category = "";

    deleteAllMessages();

    agent.add("I didn't understand");
    addMessage("I didn't understand");
    agent.add("I'm sorry, can you try again?");
    addMessage("I'm sorry, can you try again?");
  }

  async function checkCart() {
    if (token == "") {
      agent.add("Login to see your cart");
      addMessage("Login to see your cart");
      return;
    }

    let request = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-access-token": token,
      },
    };

    const serverReturn = await fetch(
      ENDPOINT_URL + "/application/products/",
      request
    );
    const serverResponse = await serverReturn.json();

    let return_string = "";

    for (let product of serverResponse.products) {
      return_string +=
        product.name + ": Quantity - " + product.count + "------" + "\n";
    }

    agent.add(return_string);
    addMessage(return_string);
  }

  async function queryProduct() {
    let product_name = agent.parameters.product;

    let request = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    };

    const serverReturn = await fetch(ENDPOINT_URL + "/products/", request);
    let serverResponse = await serverReturn.json();

    // case 1: current_category is none
    if (current_category == "") {
      let chosen_product = findBestMatchProduct(
        product_name,
        serverResponse.products
      );
      current_product = chosen_product;
      agent.add(chosen_product.name + ": Price - $" + chosen_product.price);
      addMessage(chosen_product.name + ": Price - $" + chosen_product.price);
    }

    // case 2: current_category is valid
    else {
      // filter server response objects to only include products that match the current category
      serverResponse = serverResponse.products.filter(
        (product) => product.category == current_category
      );

      //
      let chosen_product = findBestMatchProduct(product_name, serverResponse);
      current_product = chosen_product;
      agent.add(chosen_product.name + ": " + chosen_product.description);
      addMessage(chosen_product.name + ": " + chosen_product.description);
    }
  }

  async function queryProductReviews() {
    let product_id = current_product.id;

    let request = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    };

    const serverReturn = await fetch(
      ENDPOINT_URL + "/products/" + product_id + "/reviews",
      request
    );
    const serverResponse = await serverReturn.json();

    let return_string = "";
    for (let review of serverResponse.reviews) {
      return_string +=
        "Stars: " + review.stars + " - " + review.text + "------" + "\n";
    }

    if (return_string == "") {
      return_string = "No reviews for this product";
    }

    agent.add(return_string);
    addMessage(return_string);
  }

  async function addToCart() {
    if (token == "") {
      agent.add("Login to see your cart");
      addMessage("Login to see your cart");
      return;
    }

    if (current_product == undefined) {
      agent.add(
        "Please select a product first by saying I want an item and then answering to the prompt"
      );
      addMessage(
        "Please select a product first by saying I want an item and then answering to the prompt"
      );
      return;
    }

    for (let i = 0; i < agent.parameters.quantity; i++) {
      let product_id = current_product.id;

      let request = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-access-token": token,
        },
      };

      const serverReturn = await fetch(
        ENDPOINT_URL + "/application/products/" + product_id,
        request
      );
      const serverResponse = await serverReturn.json();

      console.log(serverResponse);

      agent.add("Added " + current_product.name + " to cart");
      addMessage("Added " + current_product.name + " to cart");
    }
  }

  async function removeFromCart() {
    if (token == "") {
      agent.add("Login to see your cart");
      addMessage("Login to see your cart");
      return;
    }

    if (current_product == undefined) {
      agent.add(
        "Please select a product first by saying I want an item and then answering to the prompt"
      );
      addMessage(
        "Please select a product first by saying I want an item and then answering to the prompt"
      );
      return;
    }

    try {
      for (let i = 0; i < agent.parameters.quantity; i++) {
        let product_id = current_product.id;

        let request = {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-access-token": token,
          },
        };

        const serverReturn = await fetch(
          ENDPOINT_URL + "/application/products/" + product_id,
          request
        );
        const serverResponse = await serverReturn.json();

        if (serverResponse.message == "Product not found") {
          agent.add(product.name + " is no more");
          addMessage(product.name + " is no more");
          return;
        }

        console.log(serverResponse);

        agent.add("Removed " + current_product.name + " from cart");
        addMessage("Removed " + current_product.name + " from cart");
      }
    } catch (error) {
      agent.add("We got rid of all of them");
      addMessage("We got rid of all of them");
    }
  }

  async function checkout() {
    await checkCart();

    agent.add("Type yes if you want to confirm your purchase");
    addMessage("Type yes if you want to confirm your purchase");
    agent.add("Type no if you want to cancel your purchase");
    addMessage("Type no if you want to cancel your purchase");
  }

  async function checkoutYes() {
    if (token == "") {
      agent.add("Login to see your cart");
      addMessage("Login to see your cart");
      return;
    }

    agent.add("Thank you for your purchase");
    addMessage("Thank you for your purchase");
    clearCart();
    let request = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-access-token": token,
      },
    };

    const serverReturn = await fetch(
      ENDPOINT_URL + "/" + username + "/cart-confirmed",
      request
    );
    const serverResponse = await serverReturn.json();

    console.log(serverResponse);
  }

  async function checkoutNo() {
    agent.add("Purchase cancelled");
    addMessage("Purchase cancelled");
  }

  async function clearCart() {
    if (token == "") {
      agent.add("Login to see your cart");
      addMessage("Login to see your cart");
      return;
    }

    let request = {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-access-token": token,
      },
    };

    const serverReturn = await fetch(
      ENDPOINT_URL + "/application/products/",
      request
    );
    const serverResponse = await serverReturn.json();

    console.log(serverResponse);

    agent.add("Your cart is empty");
    addMessage("Your cart is empty");
  }

  async function homepage() {
    current_category = "";
    current_product = undefined;

    if (token == "") {
      agent.add("Login first");
      addMessage("Login first");
      return;
    }

    agent.add("Welcome to the store");
    addMessage("Welcome to the store");

    let body = {
      back: false,
      page: "/" + username,
      dialogFlowUpdated: true,
    };

    let request = {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-access-token": token,
      },
      body: JSON.stringify(body),
    };

    const serverReturn = await fetch(ENDPOINT_URL + "/application", request);
    const serverResponse = await serverReturn.json();

    console.log(serverResponse);

    agent.add("Type 'I want an item' to see our products");
    addMessage("Type 'I want an item' to see our products");
  }

  async function previousPage() {
    if (token == "") {
      agent.add("Login first");
      addMessage("Login first");
      return;
    }

    let body = {
      back: true,
    };

    let request = {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-access-token": token,
      },
      body: JSON.stringify(body),
    };

    const serverReturn = await fetch(ENDPOINT_URL + "/application", request);
    const serverResponse = await serverReturn.json();

    console.log(serverResponse);

    agent.add("Went back to previous page");
    addMessage("Went back to previous page");
  }

  function deleteMsgs() {
    agent.add("Resetting")
    deleteAllMessages();
  }

  let intentMap = new Map();
  intentMap.set("Default Welcome Intent", welcome);
  // You will need to declare this `Login` intent in DialogFlow to make this work
  intentMap.set("Login", login);
  intentMap.set("Category", category);
  intentMap.set("Tags-For-Category", tagForCategory);
  intentMap.set("Check-Cart", checkCart);
  intentMap.set("Add-Cart", addToCart);
  intentMap.set("Remove-Cart", removeFromCart);
  intentMap.set("Clear-Cart", clearCart);
  intentMap.set("Query-Product", queryProduct);
  intentMap.set("Query-Product-Reviews", queryProductReviews);
  intentMap.set("Checkout", checkout);
  intentMap.set("Checkout - yes", checkoutYes);
  intentMap.set("Checkout - no", checkoutNo);
  intentMap.set("Homepage", homepage);
  intentMap.set("Previous-Page", previousPage);
  intentMap.set("Clean-Messages", deleteMsgs);
  intentMap.set("Default Fallback Intent", fallback);
  //intentMap.set("Tag", tag);
  addMessage(agent.query, true);

  agent.handleRequest(intentMap);
});

function navigate(category, agent, back = false) {
  // make a put request to the server to update the navigation context
  // if you want to navigate back, set back to true
  // if you want to navigate forward, set back to false
  // if you want to navigate to a specific category, set category to the category name

  if (token == "") {
    agent.add("You need to login first");
    return;
  }

  current_category = category;

  let body = {
    back: back,
    page: "/" + username + "/" + category,
    dialogFlowUpdated: true,
  };

  fetch(ENDPOINT_URL + "/application", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-access-token": token,
    },
    body: JSON.stringify(body),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log(data);
      agent.add(data.message);
    })
    .catch((error) => console.log("error", error));

  for (let response of agent.consoleMessages) agent.add(response);
}

async function findTags(agent) {
  return fetch(ENDPOINT_URL + "/categories/" + current_category + "/tags", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      return_string =
        "We found the following tags for " + current_category + ": " + "\n";
      data.tags.forEach((element) => {
        // add element + ',' unless it is the last element
        if (element != data.tags[data.tags.length - 1]) {
          return_string += element + ", ";
        } else {
          return_string += element;
        }
      });
      agent.add(return_string);
    })
    .catch((error) =>
      agent.add("Sorry, I couldn't find any tags for " + current_category)
    );
}

function findBestMatchProduct(keyword, products) {
  // uses Levenshtein distance to find the best match for the keyword
  // source https://stackoverflow.com/questions/10473745/compare-strings-javascript-return-of-likely
  function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    var costs = new Array();
    for (var i = 0; i <= s1.length; i++) {
      var lastValue = i;
      for (var j = 0; j <= s2.length; j++) {
        if (i == 0) costs[j] = j;
        else {
          if (j > 0) {
            var newValue = costs[j - 1];
            if (s1.charAt(i - 1) != s2.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  function scoreKeywordProduct(s1, s2) {
    var longer = s1;
    var shorter = s2;
    if (s1.length < s2.length) {
      longer = s2;
      shorter = s1;
    }
    var longerLength = longer.length;
    if (longerLength == 0) {
      return 1.0;
    }
    return (
      (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength)
    );
  }

  let bestMatch = {
    product: undefined,
    score: 0,
  };

  for (let product of products) {
    let score = scoreKeywordProduct(keyword, product.name);
    if (score >= bestMatch.score) {
      bestMatch.product = product;
      bestMatch.score = score;
    }
  }

  return bestMatch.product;
}

async function addMessage(message, isUser = false) {

  if (token == "") {
    return;
  }

  let body = {
    text: message,
    date: new Date().toISOString(),
    isUser: isUser,
  };

  return fetch(ENDPOINT_URL + "/application/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-token": token,
    },
    body: JSON.stringify(body),
  })
    .then((response) => console.log(response))
    .then((data) => {
      console.log(data);
    })
    .catch((error) => console.log("error", error));
}

async function deleteAllMessages() {
  // delete application/messages

  if (token == "") {
    return;
  }

  return fetch(ENDPOINT_URL + "/application/messages", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "x-access-token": token,
    },
  })


    .then((response) => console.log(response))
    .then((data) => {
      console.log(data);
    }
    )
    .catch((error) => console.log("error", error));

}

app.listen(process.env.PORT || 8080);
